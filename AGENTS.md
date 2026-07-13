# Instruções do projeto

## Escopo atual

- Trabalhe exclusivamente no backend e no frontend.
- Não altere arquivos do workspace `mobile` nem implemente funcionalidades para mobile.
- Não inclua o mobile nas validações da tarefa.
- Essa restrição só pode ser removida por uma nova instrução explícita do usuário.

## Validação obrigatória após alterações de código

Antes de concluir qualquer tarefa que altere código, valide a alteração no(s) workspace(s) afetado(s).

- Execute o lint disponível.
- Execute o build e/ou a checagem de tipos disponível.
- Execute os testes automatizados relevantes para a alteração.
- Em mudanças compartilhadas ou que afetem mais de um workspace, valide todos os workspaces impactados.
- Se a alteração corrigir um defeito ou adicionar comportamento, crie ou atualize testes quando isso for viável.
- Não considere a tarefa concluída enquanto houver erro causado pela alteração.
- Nunca afirme que uma verificação passou sem tê-la executado.
- Se alguma verificação não puder ser executada por limitação do ambiente, dependência externa ou ausência de script, informe claramente qual comando não foi executado e o motivo.

Use os scripts definidos no `package.json` correspondente. Neste repositório, os comandos básicos são:

- Backend: `npm run lint --workspace=backend`, `npm run build --workspace=backend` e testes relevantes com `npm test --workspace=backend -- <filtro>` (ou a suíte completa quando necessário).
- Frontend: `npm run lint --workspace=frontend` e `npm run build --workspace=frontend`.

Ao finalizar, resuma as validações executadas e seus resultados.
