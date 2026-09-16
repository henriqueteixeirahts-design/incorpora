import { describe, expect, it } from "vitest";
import { getCurrentOrgId, withOrgContext } from "@/lib/tenant-context";

describe("withOrgContext — escopo por .run(), seguro pra várias organizações na mesma invocação", () => {
  it("fora de qualquer withOrgContext, o contexto está vazio", () => {
    expect(getCurrentOrgId()).toBeNull();
  });

  it("dentro de withOrgContext, getCurrentOrgId devolve o organizationId passado", () => {
    withOrgContext("org-a", () => {
      expect(getCurrentOrgId()).toBe("org-a");
    });
  });

  it("depois que withOrgContext termina, o contexto volta a vazio (não vaza pra continuação de quem chamou)", () => {
    withOrgContext("org-a", () => {
      /* nada */
    });
    expect(getCurrentOrgId()).toBeNull();
  });

  it("duas organizações em sequência não vazam uma pra outra", async () => {
    const seen: string[] = [];

    await withOrgContext("org-a", async () => {
      seen.push(getCurrentOrgId()!);
    });
    await withOrgContext("org-b", async () => {
      seen.push(getCurrentOrgId()!);
    });

    expect(seen).toEqual(["org-a", "org-b"]);
    expect(getCurrentOrgId()).toBeNull();
  });

  it("várias organizações em paralelo (Promise.all) — cada execução só enxerga o próprio organizationId, mesmo intercalando", async () => {
    const orgIds = ["org-1", "org-2", "org-3", "org-4", "org-5"];

    const results = await Promise.all(
      orgIds.map((orgId) =>
        withOrgContext(orgId, async () => {
          // Um await no meio força o event loop a intercalar as execuções
          // paralelas — se o contexto vazasse entre elas, apareceria aqui.
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
          const seenMidway = getCurrentOrgId();
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
          const seenAtEnd = getCurrentOrgId();
          return { orgId, seenMidway, seenAtEnd };
        }),
      ),
    );

    for (const result of results) {
      expect(result.seenMidway).toBe(result.orgId);
      expect(result.seenAtEnd).toBe(result.orgId);
    }
    expect(getCurrentOrgId()).toBeNull();
  });

  it("withOrgContext aninhado dentro de outro restaura o contexto externo ao sair", () => {
    withOrgContext("org-outer", () => {
      expect(getCurrentOrgId()).toBe("org-outer");

      withOrgContext("org-inner", () => {
        expect(getCurrentOrgId()).toBe("org-inner");
      });

      expect(getCurrentOrgId()).toBe("org-outer");
    });
    expect(getCurrentOrgId()).toBeNull();
  });
});
