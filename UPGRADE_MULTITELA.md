# Upgrade multitela — ambiente de testes

Esta versão adiciona dois modos de interface:

- **Tabela**, voltada para computador e operação ampla;
- **Cartões**, voltada para celular e navegação por telas.

Também contém a base de **Sala Compartilhada** com Supabase Realtime. Sem `SUPA_URL` e `SUPA_KEY` preenchidos no `index.html`, o aplicativo permanece local/offline e a opção de sala fica desativada.

## Correções incluídas

- comparação canônica de configurações JSONB para impedir loop de eco;
- trava e repetição automática de envios que falharem;
- instantâneos locais só avançam após confirmação do servidor;
- validação do código de sala;
- geração de IDs com menor risco de colisão entre aparelhos;
- service worker v3 com atualização `network-first` do aplicativo;
- SQL do Realtime repetível;
- testes de concorrência e fuzz mantidos no repositório.

## Testes

```bash
npm test
```

O SQL de teste está em `supabase/sala.sql`. As políticas abertas são apenas para nomes fictícios. Não utilizar dados reais de pacientes antes de configurar autenticação e RLS restrita.
