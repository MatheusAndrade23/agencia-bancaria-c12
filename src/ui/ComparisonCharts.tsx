import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip, type ChartOptions, type Plugin } from 'chart.js'
import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import { meanAndSd } from '../sim/metrics'
import {
  ALGORITHMS, ALGORITHM_LABEL, LOCK_MODES, LOCK_MODE_LABEL, formatMoney,
  type Metrics, type RunRecord,
} from '../sim/types'
import { PALETTE, formatMs } from './theme'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface Stat {
  mean: number
  sd: number
  n: number
}

interface Series {
  label: string
  stats: Stat[]
}

/** Desenha o desvio padrão como uma haste sobre cada barra. */
const errorBars: Plugin<'bar'> = {
  id: 'errorBars',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const stats = (dataset as unknown as { stats?: Stat[] }).stats
      const meta = chart.getDatasetMeta(datasetIndex)
      if (!stats || meta.hidden) return
      meta.data.forEach((bar, i) => {
        const stat = stats[i]
        if (!stat || stat.n < 2 || stat.sd === 0) return
        const top = chart.scales.y.getPixelForValue(stat.mean + stat.sd)
        const bottom = chart.scales.y.getPixelForValue(Math.max(0, stat.mean - stat.sd))
        ctx.save()
        ctx.strokeStyle = String((dataset as unknown as { errorColor?: string }).errorColor ?? '#000')
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(bar.x, top)
        ctx.lineTo(bar.x, bottom)
        ctx.moveTo(bar.x - 5, top)
        ctx.lineTo(bar.x + 5, top)
        ctx.moveTo(bar.x - 5, bottom)
        ctx.lineTo(bar.x + 5, bottom)
        ctx.stroke()
        ctx.restore()
      })
    })
  },
}

interface ChartCardProps {
  title: string
  subtitle: string
  labels: string[]
  series: Series[]
  format(value: number): string
}

function ChartCard({ title, subtitle, labels, series, format }: ChartCardProps) {
  const palette = PALETTE
  const hasData = series.some((s) => s.stats.some((stat) => stat.n > 0))
  const data = {
    // quebra o rótulo em duas linhas para o texto do eixo não girar
    labels: labels.map((label) => label.split(/ (?=[+(])/)),
    datasets: series.map((s, i) => ({
      label: s.label,
      data: s.stats.map((stat) => (stat.n > 0 ? stat.mean : null)),
      stats: s.stats,
      errorColor: palette.text,
      backgroundColor: palette.series[i],
      borderRadius: 4,
      borderSkipped: 'bottom' as const,
      maxBarThickness: 34,
      categoryPercentage: 0.7,
      barPercentage: 0.86,
    })),
  }
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: series.length > 1, position: 'bottom', labels: { color: palette.textSecondary, boxWidth: 12, boxHeight: 12 } },
      tooltip: {
        callbacks: {
          label(context) {
            const stat = series[context.datasetIndex].stats[context.dataIndex]
            const spread = stat.n > 1 ? ` ± ${format(stat.sd)}` : ''
            return `${context.dataset.label}: ${format(stat.mean)}${spread} (n=${stat.n})`
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: palette.textSecondary, maxRotation: 0 }, border: { color: palette.grid } },
      y: {
        beginAtZero: true,
        grid: { color: palette.grid },
        border: { display: false },
        ticks: { color: palette.textMuted, callback: (value) => format(Number(value)), maxTicksLimit: 6 },
      },
    },
  }
  return (
    <figure className="chart-card">
      <figcaption>
        <strong>{title}</strong>
        <span className="muted small">{subtitle}</span>
      </figcaption>
      <div className="chart-box">
        {hasData ? <Bar data={data} options={options} plugins={[errorBars]} /> : <p className="empty">Sem execuções concluídas.</p>}
      </div>
      <details className="chart-table">
        <summary className="small">Ver os números</summary>
        <table className="mini-table">
          <thead>
            <tr>
              <th />
              {series.map((s) => (
                <th key={s.label}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label, i) => (
              <tr key={label}>
                <td>{label}</td>
                {series.map((s) => {
                  const stat = s.stats[i]
                  return (
                    <td key={s.label}>
                      {stat.n === 0 ? '—' : `${format(stat.mean)}${stat.n > 1 ? ` ± ${format(stat.sd)}` : ''} (n=${stat.n})`}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

/** Gráficos de barras do cenário selecionado. Só execuções concluídas entram nas médias. */
export function ComparisonCharts({ runs }: { runs: RunRecord[] }) {
  const completed = useMemo(() => runs.filter((run) => run.status === 'completed'), [runs])
  const byAlgorithm = (value: (m: Metrics) => number) =>
    ALGORITHMS.map((alg) => meanAndSd(completed.filter((run) => run.algorithm === alg).map((run) => value(run.metrics))))
  const byLock = (value: (m: Metrics) => number) =>
    LOCK_MODES.map((mode) => meanAndSd(completed.filter((run) => run.lockMode === mode).map((run) => value(run.metrics))))
  const algorithmLabels = ALGORITHMS.map((alg) => ALGORITHM_LABEL[alg])
  const lockLabels = LOCK_MODES.map((mode) => LOCK_MODE_LABEL[mode])
  const money = (cents: number) => formatMoney(Math.round(cents))

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Gráficos do cenário</h2>
        <span className="muted">
          média das execuções concluídas ({completed.length} de {runs.length}); a haste é o desvio padrão
        </span>
      </header>
      <div className="chart-grid">
        <ChartCard
          title="Espera média por algoritmo"
          subtitle="tempo na fila até ser chamado"
          labels={algorithmLabels}
          series={[{ label: 'Espera média', stats: byAlgorithm((m) => m.waitAvgMs) }]}
          format={formatMs}
        />
        <ChartCard
          title="Espera: preferenciais vs. comuns"
          subtitle="a diferença evidencia a starvation"
          labels={algorithmLabels}
          series={[
            { label: 'Preferenciais', stats: byAlgorithm((m) => m.waitPrefAvgMs) },
            { label: 'Comuns', stats: byAlgorithm((m) => m.waitCommonAvgMs) },
          ]}
          format={formatMs}
        />
        <ChartCard
          title="Makespan por modo de sincronismo"
          subtitle="tempo total para atender a fila inteira"
          labels={lockLabels}
          series={[{ label: 'Makespan', stats: byLock((m) => m.makespanMs) }]}
          format={formatMs}
        />
        <ChartCard
          title="Dinheiro inconsistente por modo de sincronismo"
          subtitle="módulo da diferença na invariante"
          labels={lockLabels}
          series={[{ label: 'Dinheiro inconsistente', stats: byLock((m) => Math.abs(m.inconsistentCents)) }]}
          format={money}
        />
      </div>
    </section>
  )
}
