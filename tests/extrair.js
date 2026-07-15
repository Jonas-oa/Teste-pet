/* Extrai as funções puras do index.html para dentro de nucleo.js.
   Rode SEMPRE antes dos testes: a bateria precisa testar o arquivo vivo,
   nunca uma cópia congelada — senão ela passa verde testando código velho.
   Uso:  node extrair.js                                                   */
const fs = require('fs');
const path = require('path');

const ORIGEM = path.join(__dirname, '..', 'index.html');
const DESTINO = path.join(__dirname, 'nucleo.js');

const ALVOS = [
  ['stableStringify',         /function stableStringify\(.*?\n\}\n/s],
  ['normalizarCodigoSala',    /const normalizarCodigoSala=.*?\n/s],
  ['novoIdPaciente',          /const novoIdPaciente=.*?\n/s],
  ['toMin',                   /const toMin=.*?\n/s],
  ['minsToTime',              /const minsToTime=.*?\n/s],
  ['addMin',                  /const addMin=.*?\n/s],
  ['decair',                  /const decair=.*?\n/s],
  ['getRelMin',               /const getRelMin=.*?\n\};/s],
  ['recalc',                  /function recalc\(.*?\n\}\n/s],
  ['reordenarFilaPorPosicao', /function reordenarFilaPorPosicao\(.*?\n\}\n/s],
  ['CAMPOS_PAC',              /const CAMPOS_PAC=.*?\n/s],
  ['COL_PAC',                 /const COL_PAC=.*?\n/s],
  ['valPac',                  /const valPac=.*?\n/s],
  ['pacParaLinha',            /const pacParaLinha=.*?\n/s],
  ['linhaParaPac',            /const linhaParaPac=.*?\n/s],
  ['instantePac',             /const instantePac=.*?\n/s],
  ['difPac',                  /const difPac=.*?\n/s],
  ['temDose',                 /const temDose=.*?\n/s],
  ['mesclarNaCarga',          /function mesclarNaCarga\(.*?\n\}\n/s],
  ['horariosDuplicados',      /const horariosDuplicados=.*?\n\};/s],
];

const html = fs.readFileSync(ORIGEM, 'utf8').replace(/\r\n/g, '\n');
const partes = [];
const nomes = [];
for (const [nome, re] of ALVOS) {
  const m = html.match(re);
  if (!m) {
    console.error(`ERRO: não achei "${nome}" no index.html.`);
    console.error('A função foi renomeada ou removida? Ajuste ALVOS antes de rodar os testes.');
    process.exit(1);
  }
  partes.push(m[0]);
  nomes.push(nome);
}

const saida = partes.join('\n') + `\n\nmodule.exports={${nomes.join(',')}};\n`;
fs.writeFileSync(DESTINO, saida);
console.log(`nucleo.js gerado de index.html — ${nomes.length} símbolos, ${saida.length} chars`);
