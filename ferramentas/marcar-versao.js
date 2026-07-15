/* Carimba APP_BUILD no index.html com o instante atual (UTC).
   Rode ANTES de cada commit que mexa no index.html:

     node ferramentas/marcar-versao.js

   Para que serve: o service worker já entregou uma cópia de duas semanas atrás
   como se fosse a versão atual, escondendo correções de cálculo e parecendo bug
   no app. Com o carimbo, o aparelho compara o build que está rodando com o
   publicado e avisa na tela quando está velho.

   Opcional: passe a versão como argumento para também mexer no APP_VERSION.
     node ferramentas/marcar-versao.js 3.1                                    */
const fs = require('fs');
const path = require('path');

const ARQ = path.join(__dirname, '..', 'index.html');
let s = fs.readFileSync(ARQ, 'utf8');

const agora = new Date().toISOString().slice(0, 16) + 'Z';   // 2026-07-15T18:35Z
const versao = process.argv[2];

const reBuild = /const APP_BUILD="[^"]*";/;
if (!reBuild.test(s)) {
  console.error('ERRO: não achei "const APP_BUILD=" no index.html. Foi renomeado?');
  process.exit(1);
}
const buildAntigo = s.match(/const APP_BUILD="([^"]*)";/)[1];
s = s.replace(reBuild, `const APP_BUILD="${agora}";`);

let versaoFinal = s.match(/const APP_VERSION="([^"]*)";/);
versaoFinal = versaoFinal ? versaoFinal[1] : '?';
if (versao) {
  const reV = /const APP_VERSION="[^"]*";/;
  if (!reV.test(s)) { console.error('ERRO: não achei "const APP_VERSION=".'); process.exit(1); }
  s = s.replace(reV, `const APP_VERSION="${versao}";`);
  versaoFinal = versao;
}

fs.writeFileSync(ARQ, s);
console.log(`APP_BUILD: ${buildAntigo}  ->  ${agora}`);
console.log(`APP_VERSION: ${versaoFinal}`);
console.log('\nLembre: quem abrir o app com cache antigo só vai ver a barra de');
console.log('atualização depois que o index.html publicado tiver este carimbo.');
