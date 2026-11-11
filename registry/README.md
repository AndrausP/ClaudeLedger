# Claude Ledger — registry da comunidade

Índice aberto de extensões para Claude Code (plugins, marketplaces, skills, agentes e MCP servers).
O app **Claude Ledger** lê o `index.json` deste repositório pela CDN, sem servidor próprio.

## Como enviar uma extensão

1. Faça um fork e copie `entries/_template.json` para `entries/<nome>.json`.
2. Preencha:

| Campo | Obrigatório | Regra |
|---|---|---|
| `name` | sim | minúsculas, números e hífen; igual ao nome do arquivo |
| `description` | sim | 10 a 300 caracteres |
| `repo` | sim | `https://github.com/…`, `gitlab.com` ou `bitbucket.org` |
| `commit` | não | SHA de 40 caracteres. Vazio = último commit no momento da publicação |
| `kind` | não | `marketplace`, `plugin`, `skills`, `agents` ou `mcp` (detectado se vazio) |
| `tags` | não | até 6 |
| `author` | não | seu usuário |

3. Abra o Pull Request. A validação automática clona o repo, confere o formato e
   **marca se a extensão tem hooks** (comandos que rodam sozinhos). Nada do repo é executado.

## O que a validação garante — e o que não garante

- ✅ O repositório existe, é público e tem formato reconhecido pelo Claude Code.
- ✅ O commit fica fixado no índice: o app mostra exatamente o que foi analisado.
- ✅ Hooks e MCP servers ficam visíveis antes de instalar.
- ❌ **Não é auditoria de segurança.** Revise o código antes de instalar algo com hooks ou MCP local.

## Usar no Claude Ledger

Explorar → Comunidade → cole a URL do índice:

```
https://cdn.jsdelivr.net/gh/<seu-usuario>/claude-ledger-registry@main/index.json
```

## Rodar localmente

```
node scripts/build.mjs --check   # só valida
node scripts/build.mjs           # valida e gera index.json
```
