# Especificação — Refinamentos do Cadastro de Clientes (Incorpora / TSH Incorporadora)

Complementa o módulo Clientes já implementado no novo padrão de UI (lista com busca/ordenação/paginação + modal com abas: Dados / Contatos / Atendimento / Anexos / Acessos). Este documento define os refinamentos de validação, obrigatoriedade e auditoria.

Os mesmos padrões definidos aqui valem como referência para os demais cadastros do sistema (SPE — ver `ESPEC_CADASTRO_SPE.md` —, Fornecedores, Imobiliárias/Corretores) conforme forem migrados para o novo padrão.

---

## 1. Validação de CPF/CNPJ

- Validar o **dígito verificador** (algoritmo oficial), não apenas o formato/máscara
- Impedir o salvamento se o número for inválido, com mensagem de erro clara junto ao campo (ex.: "CPF inválido — verifique os dígitos")
- Aplicar máscara automática conforme o tipo: `000.000.000-00` (PF) / `00.000.000/0000-00` (PJ)
- O campo muda de rótulo e máscara conforme o Tipo selecionado (Pessoa física → CPF; Pessoa jurídica → CNPJ)
- **Impedir duplicidade**: não permitir cadastrar dois clientes com o mesmo CPF/CNPJ; ao detectar, mostrar mensagem indicando que o cliente já existe (idealmente com link para abrir o registro existente)
- Rejeitar sequências conhecidas inválidas que passam no algoritmo (ex.: `111.111.111-11`, `00.000.000/0000-00`)

## 2. Contato obrigatório

- **E-mail: obrigatório** — validar formato
- **Telefone: obrigatório** — máscara para fixo e celular brasileiro (`(00) 0000-0000` / `(00) 00000-0000`)
- Vale tanto no cadastro rápido (aba Dados) quanto nos contatos adicionais (aba Contatos): todo contato adicional precisa ter ao menos nome + um meio de contato (e-mail ou telefone)

## 3. Endereço completo com autocompletar por CEP

- Primeiro campo da seção: **CEP** (com máscara `00000-000`)
- Ao preencher o CEP, consultar a **API pública ViaCEP** (gratuita, sem chave — `https://viacep.com.br/ws/{cep}/json/`) e preencher automaticamente: **Logradouro, Bairro, Cidade, UF**
- Campos preenchidos automaticamente permanecem **editáveis** (o ViaCEP pode estar desatualizado ou o CEP pode ser genérico da cidade)
- **Número** e **Complemento**: campos separados, preenchidos manualmente (não fazem parte do retorno do ViaCEP)
- Se o CEP não for encontrado (404 do ViaCEP), não bloquear: liberar preenchimento manual de todos os campos com um aviso discreto ("CEP não encontrado — preencha o endereço manualmente")
- Tratar indisponibilidade da API da mesma forma (fallback manual, nunca travar o cadastro por causa do ViaCEP)

Ordem visual da seção Endereço:
```
CEP  [_____-___]  (autocompleta ↓)
Logradouro [________________________]
Número [______]   Complemento [______]
Bairro [____________]
Cidade [____________]  UF [__]
```

## 4. Auditoria de criação e alteração

- Registrar **quem cadastrou e quando** (usuário + data/hora), e **quem alterou por último e quando**
- Reaproveitar o sistema de auditoria já existente (`DevelopmentEvent`, usado desde a Sprint 0) — não criar mecanismo paralelo
- Exibir na interface, em local discreto do modal (ex.: rodapé ou topo da aba Dados):
  > "Cadastrado por [nome] em [dd/mm/aaaa hh:mm] · Última alteração por [nome] em [dd/mm/aaaa hh:mm]"
- A trilha completa de alterações (histórico de todas as edições, não só a última) já existe via `DevelopmentEvent` — a exibição resumida acima é o que aparece no cadastro; o histórico completo pode ser consultado onde a auditoria já é exibida hoje

## 5. Aplicação em cascata

Estes refinamentos valem para o módulo Clientes agora e devem ser replicados nos demais cadastros conforme forem migrados para o novo padrão de UI:

| Cadastro | CPF/CNPJ validado | Contato obrigatório | CEP/ViaCEP | Auditoria |
|---|---|---|---|---|
| Clientes | ✅ | ✅ | ✅ | ✅ |
| SPEs | ✅ (CNPJ + sócios + investidores) | ✅ | ✅ | ✅ |
| Fornecedores | ✅ | ✅ | ✅ | ✅ |
| Imobiliárias/Corretores | ✅ (CNPJ da imobiliária, CPF/CRECI do corretor) | ✅ | ✅ | ✅ |
| Usuários | — | e-mail já obrigatório | — | ✅ |

## 6. Regressão

Após implementar, revalidar o fluxo comercial completo que depende de cliente (reserva → proposta → venda → contrato), garantindo que:
- Clientes já cadastrados **antes** da mudança (sem e-mail/telefone ou com CPF não validado) continuam funcionando nos fluxos existentes — a obrigatoriedade vale para **novos cadastros e edições**, não deve quebrar registros legados
- Ao editar um registro legado incompleto, aí sim exigir o preenchimento dos campos agora obrigatórios
