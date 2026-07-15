# Testes da sala compartilhada

Bateria que simula o protocolo de sincronia com um **servidor falso** em memória.
Não fala com o Supabase de verdade: exercita a lógica de sincronia contra as
funções puras extraídas do `index.html`.

## Como rodar

```bash
cd testes
node extrair.js      # OBRIGATÓRIO: regenera nucleo.js a partir do ../index.html
node sim.js          # 40 cenários dirigidos
node fuzz.js 15000   # cenários aleatórios (2-3 aparelhos, operações sorteadas)
```

`extrair.js` tem que rodar **antes** dos testes, sempre. `nucleo.js` é gerado e
não é versionado — se você testar uma cópia congelada, a bateria passa verde
testando código velho. Se alguma função for renomeada no `index.html`, o
`extrair.js` falha alto em vez de testar o arquivo errado.

## Invariantes do fuzz

1. todos os aparelhos convergem para o mesmo estado
2. nenhum registro de dose administrada some sem alguém tê-lo apagado
3. nenhum loop de re-envio infinito
4. horário de injeção duplicado, se ocorrer, é sempre detectável pelo app

## Bugs que esta bateria pegou

Todos eram perda **silenciosa** de dado clínico — os aparelhos convergiam, só
que no valor errado.

| # | Bug | Causa | Correção |
|---|-----|-------|----------|
| S8 | reload de um aparelho apagava dose registrada por outro | empurrava a lista local inteira antes de olhar a sala | puxa a sala primeiro; `mesclarNaCarga` nunca deixa vazio sobrescrever dose registrada |
| S13 | reload apagava a correção de calibração do frasco | mesma causa, no `cfg` | a calibração da sala manda; local só sobe se a sala não tiver nenhuma |
| S7 / diag | arrastar a fila apagava dose recém-registrada por outro aparelho | `reordenarFilaPorPosicao` escreve `doseReal:""` nos pendentes; empurrando a linha inteira, esse vazio matava a dose do colega | envio por **campo**: só vai o que mudou neste aparelho, e vazio→vazio não sai |

Bônus: o app aceitava dois pacientes no mesmo horário de injeção sem avisar —
por digitação ou por reordenação simultânea. Agora avisa nas duas telas.

## Limitação conhecida, medida e NÃO corrigida

A dose do paciente pendente muda sob o operador quando um colega registra dose
real, por causa da distribuição elástica. Medido no cenário S11: um pendente cai
de 9,23 → 8,78 mCi (−0,45) quando o colega registra a dose de outro paciente.
Não existe trava de "estou aspirando".

## O que a bateria NÃO cobre

- renderização React (testa o protocolo, não a interface)
- latência e reordenação de pacotes reais do Supabase Realtime
- RLS / autenticação
- comportamento real do service worker offline
