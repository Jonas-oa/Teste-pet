/* Regressão: mudança do horário de calibração com fila populada.
   Bug original: com dose registrada, o cursor de redistribuição andava
   para trás (pendentes agendados ANTES da nova calibração) e, com salto
   > 3h, o wrap de meia-noite do getRelMin embaralhava a ordem e explodia
   o decaimento. Correções: cursor monotônico (A) + bloqueio de calibração
   posterior a dose registrada (B1).
   Rode: node tests/calib.js  (após node tests/extrair.js)               */
const { getRelMin, recalc, redistribuirAposCalibracao, doseRegistradaAntesDe } = require("./nucleo.js");

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? "ok  " : "FALHA"} ${msg}`);
  if (!cond) falhas++;
};

const base = () => ([
  { id: 1, nome: "Paciente 1", peso: "70", hSim: "09:15", doseReal: "" },
  { id: 2, nome: "Paciente 2", peso: "60", hSim: "09:35", doseReal: "" },
  { id: 3, nome: "Paciente 3", peso: "50", hSim: "09:55", doseReal: "" },
  { id: 4, nome: "Paciente 4", peso: "40", hSim: "10:15", doseReal: "" },
]);

const nomesOrdenados = (lista, hC) =>
  [...lista].sort((a, b) => getRelMin(a.hSim, hC) - getRelMin(b.hSim, hC)).map(p => p.nome);

console.log("\n=== C1 · mudar calibração sem doses registradas ===");
{
  const r = redistribuirAposCalibracao(base(), "09:00", "10:30", 25);
  ok(r.every(p => getRelMin(p.hSim, "10:30") >= 15), "todos os pendentes >= calibração+15");
  ok(JSON.stringify(nomesOrdenados(r, "10:30")) === JSON.stringify(["Paciente 1", "Paciente 2", "Paciente 3", "Paciente 4"]), "ordem preservada");
}

console.log("\n=== C2 · dose registrada + calibração adiada 1h30 (bug do cursor) ===");
{
  const lista = base().map(p => p.id === 1 ? { ...p, doseReal: "7.0" } : p);
  ok(doseRegistradaAntesDe(lista, "09:00", "10:30") !== null, "B1 detecta conflito (dose 09:15 < calib 10:30)");
  // Se, apesar do bloqueio, a redistribuição rodar, ela não pode agendar pendente antes da nova calibração:
  const r = redistribuirAposCalibracao(lista, "09:00", "10:30", 25);
  const pend = r.filter(p => !p.doseReal);
  ok(pend.every(p => getRelMin(p.hSim, "10:30") >= 15), "cursor monotônico: nenhum pendente antes de calib+15");
}

console.log("\n=== C3 · salto > 3h com dose registrada (bug do wrap/embaralhamento) ===");
{
  const lista = base().map(p => p.id === 1 ? { ...p, doseReal: "7.0" } : p);
  ok(doseRegistradaAntesDe(lista, "09:00", "13:00") !== null, "B1 bloqueia salto de 4h sobre dose registrada");
}

console.log("\n=== C4 · calibração recuada (permitido) ===");
{
  const lista = base().map(p => p.id === 1 ? { ...p, doseReal: "7.0" } : p);
  ok(doseRegistradaAntesDe(lista, "09:00", "08:30") === null, "recuar calibração para antes das doses é permitido");
  const r = redistribuirAposCalibracao(lista, "09:00", "08:30", 25);
  ok(r.find(p => p.id === 1).hSim === "09:15", "paciente com dose mantém horário original");
  const pend = r.filter(p => !p.doseReal);
  ok(pend.every(p => getRelMin(p.hSim, "08:30") >= 15), "pendentes >= nova calibração+15");
}

console.log("\n=== C5 · duas doses intercaladas, calibração recuada ===");
{
  const lista = base().map(p => (p.id === 1 || p.id === 3) ? { ...p, doseReal: p.id === 1 ? "7.0" : "5.0" } : p);
  const r = redistribuirAposCalibracao(lista, "09:00", "08:40", 25);
  const orden = [...r].sort((a, b) => getRelMin(a.hSim, "08:40") - getRelMin(b.hSim, "08:40"));
  let anterior = -1;
  let monotona = true;
  for (const p of orden) {
    const m = getRelMin(p.hSim, "08:40");
    if (m < anterior) monotona = false;
    anterior = m;
  }
  ok(monotona, "linha do tempo estritamente crescente após redistribuição");
  const { lista: lc, atvFinal } = recalc(r, "30", "2", "08:40", 109.8, 4, 0.08, 0.12);
  ok(lc.every(p => p.dt >= 0 && p.dt < 720), "nenhum dt absurdo (wrap) no recálculo");
  ok(isFinite(atvFinal), "atividade final finita");
}

console.log("\n=== C6 · calibração igual à dose registrada (limite) ===");
{
  const lista = base().map(p => p.id === 1 ? { ...p, doseReal: "7.0" } : p);
  ok(doseRegistradaAntesDe(lista, "09:00", "09:15") === null, "calibração exatamente no horário da dose é permitida");
}

console.log("\n" + "=".repeat(50));
if (falhas) {
  console.log(`RESULTADO: ${falhas} falha(s)`);
  process.exit(1);
}
console.log("RESULTADO: calibração ok — todos os casos passaram");
