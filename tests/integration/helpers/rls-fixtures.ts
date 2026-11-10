import { randomUUID } from "node:crypto";
import { Client } from "pg";

/**
 * RLS Etapa 4 — construtor GENÉRICO de fixtures para os testes de fronteira.
 *
 * Insere uma linha mínima válida em qualquer tabela do schema public, pela
 * role de migrations (DIRECT_URL, BYPASSRLS — nunca pelo código sob teste),
 * criando recursivamente cada pai obrigatório (FK NOT NULL) na MESMA
 * organização. Lê tudo do catálogo do Postgres (colunas, tipos, enums, FKs),
 * então cobre as 84 tabelas protegidas sem fixture escrita à mão — e uma
 * tabela nova entra sozinha.
 *
 * Valores: uuid aleatório (id e colunas uuid soltas), texto aleatório,
 * números 1, booleano false, datas now(), enum = primeiro valor, json '{}',
 * arrays vazios. Colunas com default no banco ou que aceitam nulo ficam de
 * fora.
 */
type Column = { name: string; type: string; udt: string; nullable: boolean; hasDefault: boolean; isArray: boolean };
type Fk = { column: string; parent: string };

export type InsertedRow = { table: string; id: string };

export class RlsFixtureBuilder {
  private columns = new Map<string, Column[]>();
  private fks = new Map<string, Fk[]>();
  private enums = new Map<string, string>();
  readonly inserted: InsertedRow[] = [];

  constructor(private readonly db: Client) {}

  async load() {
    const cols = await this.db.query<{ table_name: string; column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null }>(
      `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
         FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
    );
    for (const c of cols.rows) {
      const list = this.columns.get(c.table_name) ?? [];
      list.push({
        name: c.column_name,
        type: c.data_type,
        udt: c.udt_name.replace(/^_/, ""),
        nullable: c.is_nullable === "YES",
        hasDefault: c.column_default !== null,
        isArray: c.data_type === "ARRAY",
      });
      this.columns.set(c.table_name, list);
    }
    const fks = await this.db.query<{ child: string; column: string; parent: string }>(
      `SELECT cl.relname AS child, a.attname AS column, pcl.relname AS parent
         FROM pg_constraint con
         JOIN pg_class cl ON cl.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = cl.relnamespace
         JOIN pg_class pcl ON pcl.oid = con.confrelid
         JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
        WHERE con.contype = 'f' AND n.nspname = 'public' AND array_length(con.conkey, 1) = 1`,
    );
    for (const f of fks.rows) {
      const list = this.fks.get(f.child) ?? [];
      list.push({ column: f.column, parent: f.parent });
      this.fks.set(f.child, list);
    }
    const enums = await this.db.query<{ typname: string; label: string }>(
      `SELECT DISTINCT ON (t.typname) t.typname, e.enumlabel AS label
         FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid ORDER BY t.typname, e.enumsortorder`,
    );
    for (const e of enums.rows) this.enums.set(e.typname, e.label);
  }

  columnsOf(table: string): Column[] {
    const cols = this.columns.get(table);
    if (!cols) throw new Error(`tabela ${table} não existe`);
    return cols;
  }

  fkOf(table: string, column: string): Fk | undefined {
    return (this.fks.get(table) ?? []).find((f) => f.column === column);
  }

  /** Nova organização (fora de RLS — exceção do inventário). */
  async organization(name: string): Promise<string> {
    const id = randomUUID();
    await this.db.query(`INSERT INTO organizations (id, name, "updatedAt") VALUES ($1, $2, now())`, [id, name]);
    this.inserted.push({ table: "organizations", id });
    return id;
  }

  /** Insere uma linha em `table` pertencente a `orgId`; `overrides` fixa colunas. Devolve o id. */
  async insert(table: string, orgId: string, overrides: Record<string, unknown> = {}): Promise<string> {
    if (table === "organizations") return orgId;
    const values: Record<string, unknown> = {};
    for (const col of this.columnsOf(table)) {
      if (col.name in overrides) {
        values[col.name] = overrides[col.name];
        continue;
      }
      if (col.name === "id") {
        values.id = randomUUID();
        continue;
      }
      if (col.nullable || col.hasDefault) continue;
      if (col.name === "organizationId") {
        values[col.name] = orgId;
        continue;
      }
      const fk = this.fkOf(table, col.name);
      if (fk) {
        values[col.name] = fk.parent === "organizations" ? orgId : await this.insert(fk.parent, orgId);
        continue;
      }
      values[col.name] = this.valueFor(col);
    }
    const names = Object.keys(values);
    await this.db.query(
      `INSERT INTO public."${table}" (${names.map((n) => `"${n}"`).join(", ")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(", ")})`,
      names.map((n) => values[n]),
    );
    const id = values.id as string;
    this.inserted.push({ table, id });
    return id;
  }

  /** Valor de coluna para uma linha NOVA (usado também pelos testes de escrita). */
  valueFor(col: Column): unknown {
    if (col.isArray) return [];
    if (this.enums.has(col.udt)) return this.enums.get(col.udt);
    switch (col.udt) {
      case "uuid":
        return randomUUID();
      case "text":
      case "varchar":
        return `rls-${randomUUID().slice(0, 12)}`;
      case "int2":
      case "int4":
      case "int8":
      case "numeric":
      case "float4":
      case "float8":
        return 1;
      case "bool":
        return false;
      case "timestamp":
      case "timestamptz":
      case "date":
        return new Date();
      case "json":
      case "jsonb":
        return {};
      default:
        throw new Error(`tipo sem valor de fixture: ${col.udt} (${col.name})`);
    }
  }

  /** Apaga tudo o que inseriu, na ordem inversa (filhos antes dos pais). */
  async cleanup() {
    for (const row of [...this.inserted].reverse()) {
      await this.db.query(`DELETE FROM public."${row.table}" WHERE id = $1`, [row.id]);
    }
    this.inserted.length = 0;
  }
}
