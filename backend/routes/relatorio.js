const express = require('express');
const db = require('../db');
const { autenticar, exigirPapel } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar, exigirPapel('admin')); // só o diretor vê o relatório da rede

// GET /relatorio?dias=1|7|30  -> resumo consolidado das unidades do diretor
router.get('/', async (req, res) => {
  let dias = parseInt(req.query.dias || '30', 10);
  if (!Number.isFinite(dias) || dias < 1 || dias > 365) dias = 30;
  const unidades = req.usuario.todas_unidades
    ? (await db.query('SELECT id FROM unidades')).rows.map(r => r.id)
    : req.usuario.unidades;

  const intervaloDias = `${Math.max(0, dias - 1)} days`;

  const [totais, porUnidade, porCategoria, faltas, trocas, vencidos, vistorias] = await Promise.all([
    db.query(
      `SELECT tipo, COALESCE(SUM(valor),0)::numeric(12,2) AS total
       FROM lancamentos WHERE unidade_id = ANY($1) AND data >= CURRENT_DATE - ($2)::interval GROUP BY tipo`,
      [unidades, intervaloDias]
    ),
    db.query(
      `SELECT unidade_id,
              COALESCE(SUM(valor) FILTER (WHERE tipo='entrada'),0)::numeric(12,2) AS entradas,
              COALESCE(SUM(valor) FILTER (WHERE tipo='saida'),0)::numeric(12,2) AS saidas
       FROM lancamentos WHERE unidade_id = ANY($1) AND data >= CURRENT_DATE - ($2)::interval
       GROUP BY unidade_id`,
      [unidades, intervaloDias]
    ),
    db.query(
      `SELECT categoria_id, SUM(valor)::numeric(12,2) AS total FROM lancamentos
       WHERE unidade_id = ANY($1) AND data >= CURRENT_DATE - ($2)::interval AND tipo='saida'
       GROUP BY categoria_id ORDER BY total DESC LIMIT 5`,
      [unidades, intervaloDias]
    ),
    db.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE justificada)::int AS justificadas
       FROM faltas WHERE unidade_id = ANY($1) AND data >= CURRENT_DATE - ($2)::interval`,
      [unidades, intervaloDias]
    ),
    db.query(
      `SELECT turno, COUNT(*)::int AS qtd FROM trocas_plantao
       WHERE unidade_id = ANY($1) AND registrado_em >= CURRENT_DATE - ($2)::interval GROUP BY turno`,
      [unidades, intervaloDias]
    ),
    db.query(
      `SELECT COUNT(*)::int AS registros, COALESCE(SUM(quantidade),0)::int AS itens, COALESCE(SUM(prejuizo),0)::numeric(12,2) AS prejuizo
       FROM produtos_vencidos WHERE unidade_id = ANY($1) AND registrado_em >= CURRENT_DATE - ($2)::interval`,
      [unidades, intervaloDias]
    ),
    db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM vistoria_itens vi WHERE vi.vistoria_id = v.id AND vi.status='problema'
              ))::int AS com_problema
       FROM vistorias v WHERE unidade_id = ANY($1) AND data >= CURRENT_DATE - ($2)::interval`,
      [unidades, intervaloDias]
    ),
  ]);

  // ranking de avaliação de vistoria — mesma fórmula do front-end:
  // cada item OK = +1, cada item "problema" = -1; aproveitamento% = OK / total avaliado
  const { rows: rankingVistoria } = await db.query(
    `SELECT u.nome, u.papel,
            COUNT(DISTINCT v.id)::int AS vistorias,
            COUNT(*) FILTER (WHERE vi.status='ok')::int AS itens_ok,
            COUNT(*) FILTER (WHERE vi.status='problema')::int AS itens_problema
     FROM vistorias v
     JOIN vistoria_itens vi ON vi.vistoria_id = v.id
     JOIN usuarios u ON u.id = v.feito_por
     WHERE v.unidade_id = ANY($1) AND v.data >= CURRENT_DATE - ($2)::interval
     GROUP BY u.id, u.nome, u.papel`,
    [unidades, intervaloDias]
  );
  const comAvaliacao = rankingVistoria.map(p => {
    const total = p.itens_ok + p.itens_problema;
    return {
      ...p,
      pontos: p.itens_ok - p.itens_problema,
      aproveitamento: total ? Math.round((p.itens_ok / total) * 1000) / 10 : 0,
    };
  }).sort((a, b) => b.aproveitamento - a.aproveitamento || b.vistorias - a.vistorias);

  res.json({
    dias,
    totais: Object.fromEntries(totais.rows.map(r => [r.tipo, Number(r.total)])),
    porUnidade: porUnidade.rows,
    porCategoria: porCategoria.rows,
    faltas: faltas.rows[0],
    trocas: trocas.rows,
    produtosVencidos: vencidos.rows[0],
    vistorias: vistorias.rows[0],
    rankingVistoriaGerentes: comAvaliacao.filter(p => p.papel === 'gerente' || p.papel === 'admin'),
    rankingVistoriaFuncionarios: comAvaliacao.filter(p => p.papel === 'funcionario' || p.papel === 'inspetor'),
  });
});

module.exports = router;
