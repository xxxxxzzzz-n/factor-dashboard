const DATA = window.DASHBOARD_DATA;

const state = {
  week: DATA.alerts.find((item) => item.direction === "drop")?.week || DATA.meta.weeks.at(-1),
  vertical: DATA.alerts.find((item) => item.direction === "drop")?.vertical || DATA.meta.verticals[1],
  metric: DATA.alerts.find((item) => item.direction === "drop")?.metric || DATA.metrics[0].id,
};

let activeContextId = "";
let chatMessages = [];

const elements = {
  week: document.getElementById("weekSelect"),
  vertical: document.getElementById("verticalSelect"),
  metric: document.getElementById("metricSelect"),
  pageTitle: document.getElementById("pageTitle"),
  kpiGrid: document.getElementById("kpiGrid"),
  trendSubtitle: document.getElementById("trendSubtitle"),
  trendChart: document.getElementById("trendChart"),
  factorSubtitle: document.getElementById("factorSubtitle"),
  factorBars: document.getElementById("factorBars"),
  aiSummary: document.getElementById("aiSummary"),
  chatBox: document.getElementById("chatBox"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  heatmap: document.getElementById("heatmap"),
  alertsList: document.getElementById("alertsList"),
  factorTable: document.getElementById("factorTable"),
  tableSubtitle: document.getElementById("tableSubtitle"),
  aggRows: document.getElementById("aggRows"),
  rawRows: document.getElementById("rawRows"),
  finalRows: document.getElementById("finalRows"),
  dateRange: document.getElementById("dateRange"),
  verticalCompareSubtitle: document.getElementById("verticalCompareSubtitle"),
  verticalCompareChart: document.getElementById("verticalCompareChart"),
  paymentMixChart: document.getElementById("paymentMixChart"),
  waterfallSubtitle: document.getElementById("waterfallSubtitle"),
  waterfallChart: document.getElementById("waterfallChart"),
  volumeChart: document.getElementById("volumeChart"),
  donutSubtitle: document.getElementById("donutSubtitle"),
  donutChart: document.getElementById("donutChart"),
  copyPrompt: document.getElementById("copyPrompt"),
  resetToAlert: document.getElementById("resetToAlert"),
};

function metricById(id) {
  return DATA.metrics.find((metric) => metric.id === id) || DATA.metrics[0];
}

function resultKey(week = state.week, vertical = state.vertical, metric = state.metric) {
  return `${week}|${vertical}|${metric}`;
}

function getResult() {
  return DATA.factor_results[resultKey()] || DATA.factor_results[Object.keys(DATA.factor_results)[0]];
}

function getWeeklyRecord(week = state.week, vertical = state.vertical) {
  return DATA.weekly.find((row) => row.week === week && row.vertical === vertical);
}

function formatPct(value, digits = 1) {
  return `${(Number(value || 0) * 100).toFixed(digits).replace(".", ",")}%`;
}

function formatPp(value, digits = 1) {
  const number = Number(value || 0) * 100;
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(digits).replace(".", ",")} п.п.`;
}

function formatInt(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value || 0));
}

function formatMoney(value) {
  const number = Number(value || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1).replace(".", ",")} млн ₽`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(0).replace(".", ",")} тыс ₽`;
  return `${formatInt(number)} ₽`;
}

function formatMoneyShort(value) {
  const number = Number(value || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1).replace(".", ",")}м`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(0).replace(".", ",")}к`;
  return formatInt(number);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function signedClass(value) {
  if (value > 0.000001) return "positive";
  if (value < -0.000001) return "negative";
  return "neutral";
}

function hasNumber(value) {
  return value !== undefined && value !== null && Number.isFinite(Number(value));
}

function fillSelect(select, options, getValue, getLabel, selected) {
  select.innerHTML = "";
  options.forEach((option) => {
    const node = document.createElement("option");
    node.value = getValue(option);
    node.textContent = getLabel(option);
    if (node.value === selected) node.selected = true;
    select.appendChild(node);
  });
}

function initControls() {
  const weeks = DATA.meta.weeks.slice(1).reverse();
  fillSelect(elements.week, weeks, (value) => value, (value) => value, state.week);
  fillSelect(elements.vertical, DATA.meta.verticals, (value) => value, (value) => value, state.vertical);
  fillSelect(elements.metric, DATA.metrics, (metric) => metric.id, (metric) => metric.label, state.metric);

  elements.week.addEventListener("change", () => {
    state.week = elements.week.value;
    render();
  });
  elements.vertical.addEventListener("change", () => {
    state.vertical = elements.vertical.value;
    render();
  });
  elements.metric.addEventListener("change", () => {
    state.metric = elements.metric.value;
    render();
  });

  document.querySelectorAll(".chip-button").forEach((button) => {
    button.addEventListener("click", () => askAi(button.dataset.question));
  });

  elements.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    askAi(elements.chatInput.value.trim());
    elements.chatInput.value = "";
  });

  elements.copyPrompt.addEventListener("click", copyPrompt);
  elements.resetToAlert.addEventListener("click", () => {
    const alert = DATA.alerts.find((item) => item.direction === "drop") || DATA.alerts[0];
    if (!alert) return;
    state.week = alert.week;
    state.vertical = alert.vertical;
    state.metric = alert.metric;
    syncSelects();
    render();
  });
}

function syncSelects() {
  elements.week.value = state.week;
  elements.vertical.value = state.vertical;
  elements.metric.value = state.metric;
}

function renderSourceMeta() {
  elements.aggRows.textContent = `${formatInt(DATA.meta.aggregated_rows)} строк`;
  elements.rawRows.textContent = `${formatInt(DATA.meta.raw_rows)} строк`;
  elements.finalRows.textContent = `${formatInt(DATA.meta.final_result_rows)} JSON`;
  elements.dateRange.textContent = `${DATA.meta.weeks[0]} — ${DATA.meta.weeks.at(-1)}`;
}

function renderKpis(result, weekly) {
  const topNegative = result.top_negative_factors[0];
  const topPositive = result.top_positive_factors[0];
  const paymentMix = weekly ? `${formatPct(weekly.credit_card_rate)} CC / ${formatPct(weekly.bnpl_rate)} BNPL` : "—";
  const cards = [
    {
      label: result.metric_label,
      value: formatPct(result.metric_value),
      note: `${result.prev_week}: ${formatPct(result.prev_value)}`,
      tone: signedClass(result.delta),
    },
    {
      label: "Изменение WoW",
      value: formatPp(result.delta),
      note: `${formatPct(result.delta_pct)} к прошлой неделе`,
      tone: signedClass(result.delta),
    },
    {
      label: "GMV",
      value: weekly ? formatMoney(weekly.gmv) : "—",
      note: weekly ? `${formatInt(weekly.orders)} заказов` : "Нет данных",
      tone: "neutral",
    },
    {
      label: "Оплаты",
      value: paymentMix,
      note: weekly ? `${formatPct(weekly.target_rate)} целевых оплат` : "Нет данных",
      tone: "neutral",
    },
    {
      label: result.delta < 0 ? "Главный риск" : "Главный драйвер",
      value: result.delta < 0 ? topNegative?.segment_label || "—" : topPositive?.segment_label || "—",
      note:
        result.delta < 0
          ? `${topNegative?.dimension_label || "Фактор"}: ${formatPp(topNegative?.contribution || 0)}`
          : `${topPositive?.dimension_label || "Фактор"}: ${formatPp(topPositive?.contribution || 0)}`,
      tone: result.delta < 0 ? "negative" : "positive",
    },
  ];

  elements.kpiGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="kpi-card">
          <strong>${escapeHtml(card.label)}</strong>
          <div class="value ${card.tone}">${escapeHtml(card.value)}</div>
          <p class="note">${escapeHtml(card.note)}</p>
        </article>
      `,
    )
    .join("");
}

function renderTrend(result) {
  const metric = state.metric;
  const metricLabel = metricById(metric).label;
  const series = DATA.weekly.filter((row) => row.vertical === state.vertical);
  elements.trendSubtitle.textContent = `${state.vertical}: ${metricLabel}`;

  if (!series.length) {
    elements.trendChart.innerHTML = `<p class="ai-callout">Нет данных для выбранного среза.</p>`;
    return;
  }

  const width = 720;
  const height = 280;
  const margin = { top: 28, right: 26, bottom: 42, left: 48 };
  const values = series.map((row) => Number(row[metric] || 0));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (Math.abs(max - min) < 0.00001) {
    min -= 0.02;
    max += 0.02;
  }
  const pad = (max - min) * 0.16;
  min = Math.max(0, min - pad);
  max = Math.min(1, max + pad);
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const x = (index) => margin.left + (plotW * index) / Math.max(series.length - 1, 1);
  const y = (value) => margin.top + plotH - ((value - min) / (max - min || 1)) * plotH;
  const points = series.map((row, index) => `${x(index)},${y(row[metric])}`).join(" ");
  const selectedIndex = series.findIndex((row) => row.week === state.week);
  const selected = series[selectedIndex] || series.at(-1);
  const selectedX = selectedIndex >= 0 ? x(selectedIndex) : x(series.length - 1);
  const selectedY = y(selected[metric]);
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((tick) => {
      const value = min + (max - min) * tick;
      const yy = y(value);
      return `<line x1="${margin.left}" y1="${yy}" x2="${width - margin.right}" y2="${yy}" stroke="#3b3f3d" stroke-width="1"/><text x="8" y="${yy + 4}" class="axis-label">${formatPct(value, 0)}</text>`;
    })
    .join("");
  const labels = series
    .map((row, index) => {
      if (index % 2 !== 0 && index !== series.length - 1) return "";
      return `<text x="${x(index)}" y="${height - 12}" text-anchor="middle" class="axis-label">${row.week.slice(5)}</text>`;
    })
    .join("");
  const circles = series
    .map((row, index) => {
      const active = row.week === state.week;
      return `<circle cx="${x(index)}" cy="${y(row[metric])}" r="${active ? 5 : 3}" fill="${active ? "#f5d84e" : "#66a6ff"}" />`;
    })
    .join("");

  elements.trendChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Динамика метрики">
      ${grid}
      <polyline points="${points}" fill="none" stroke="#f5d84e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      ${circles}
      <line x1="${selectedX}" y1="${margin.top}" x2="${selectedX}" y2="${height - margin.bottom}" stroke="#f5d84e" stroke-dasharray="5 7"/>
      <text x="${Math.min(selectedX + 12, width - 172)}" y="${Math.max(selectedY - 12, 18)}" class="chart-value">${selected.week}: ${formatPct(selected[metric])}</text>
      ${labels}
    </svg>
  `;
}

function renderFactorBars(result) {
  elements.factorSubtitle.textContent = `${result.prev_week} → ${result.week}, ${result.metric_label}`;
  const items = [...result.top_negative_factors, ...result.top_positive_factors]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 10);
  const max = Math.max(...items.map((item) => Math.abs(item.contribution)), 0.001);

  elements.factorBars.innerHTML = items
    .map((item) => {
      const width = Math.max(3, (Math.abs(item.contribution) / max) * 100);
      const tone = item.contribution < 0 ? "negative" : "positive";
      return `
        <div class="factor-row">
          <div class="factor-label">
            <span title="${escapeHtml(item.dimension_label)} · ${escapeHtml(item.segment_label)}">${escapeHtml(item.dimension_label)} · ${escapeHtml(item.segment_label)}</span>
            <span class="${tone}">${formatPp(item.contribution)}</span>
          </div>
          <div class="bar-track"><div class="bar-fill ${tone}" style="width:${width}%"></div></div>
        </div>
      `;
    })
    .join("");
}

function recommendationForFactor(factor) {
  if (!factor) return "Сверить расчет с исходной витриной и проверить полноту данных за неделю.";
  const segment = factor.segment_label.toLowerCase();
  const dimension = factor.dimension;
  if (dimension === "platform") return `Проверить платежный сценарий и релизы на сегменте «${factor.segment_label}».`;
  if (dimension === "user_type" && segment.includes("нов")) return "Разобрать первый платеж новых пользователей: входной трафик, офферы и ошибки оплаты.";
  if (dimension === "user_type") return "Проверить повторные сценарии: изменения привычной оплаты, коммуникации и удержание.";
  if (dimension === "has_bank_offer") return "Сверить запуск, завершение и условия банковских офферов.";
  if (dimension === "has_high_category") return "Проверить повышенные категории кешбека и коммуникацию выгоды.";
  if (dimension === "subscription_type") return `Посмотреть поведение аудитории подписки «${factor.segment_label}» и пересечения с офферами.`;
  return `Проверить сегмент «${factor.segment_label}» в детализации ${factor.dimension_label}.`;
}

function buildAiNarrative(result) {
  const isDrop = result.delta < 0;
  const primary = isDrop ? result.top_negative_factors[0] : result.top_positive_factors[0];
  const secondary = isDrop ? result.top_negative_factors[1] : result.top_positive_factors[1];
  const direction = isDrop ? "снизилась" : "выросла";
  const lead = `${result.metric_label} в вертикали «${result.vertical}» ${direction} на ${formatPp(result.delta)}: ${formatPct(result.prev_value)} → ${formatPct(result.metric_value)}.`;
  const reason = primary
    ? `Основной вклад дал сегмент «${primary.segment_label}» в измерении «${primary.dimension_label}» (${formatPp(primary.contribution)}, доля заказов ${formatPct(primary.share)}).`
    : "Выраженного фактора не найдено: изменение распределено между несколькими сегментами.";
  const balancing = secondary
    ? `Второй заметный фактор: «${secondary.segment_label}» (${formatPp(secondary.contribution)}).`
    : "Второго крупного фактора нет.";
  const recs = [recommendationForFactor(primary), recommendationForFactor(secondary)]
    .filter((item, index, arr) => item && arr.indexOf(item) === index)
    .slice(0, 3);

  return { lead, reason, balancing, recs, charts: buildChartInsights(result) };
}

function buildChartInsights(result) {
  const weekly = getWeeklyRecord(result.week, result.vertical);
  const series = DATA.weekly.filter((row) => row.vertical === result.vertical);
  const previous = getWeeklyRecord(result.prev_week, result.vertical);
  const waterfallSteps = buildWaterfallSteps(result);
  const residual = waterfallSteps.find((step) => step.type === "residual")?.value || 0;
  const insights = [];

  insights.push(
    `Waterfall сходится: старт ${formatPct(result.prev_value)} + вклады ${formatPp(result.delta)} = итог ${formatPct(result.metric_value)}${Math.abs(residual) > 0.000001 ? `, остаток ${formatPp(residual)} вынесен в «Прочие»` : ""}.`,
  );

  if (weekly && previous) {
    const ordersDelta = weekly.orders - previous.orders;
    const gmvDelta = weekly.gmv - previous.gmv;
    insights.push(
      `Объемы: ${formatInt(weekly.orders)} заказов (${ordersDelta >= 0 ? "+" : ""}${formatInt(ordersDelta)} WoW), GMV ${formatMoney(weekly.gmv)} (${gmvDelta >= 0 ? "+" : ""}${formatMoney(gmvDelta)} WoW).`,
    );
  } else if (weekly) {
    insights.push(`Объемы: ${formatInt(weekly.orders)} заказов и GMV ${formatMoney(weekly.gmv)} за выбранную неделю.`);
  }

  if (weekly) {
    insights.push(
      `Платежный микс: кредитная карта ${formatPct(weekly.credit_card_rate)}, BNPL ${formatPct(weekly.bnpl_rate)}, альтернативные оплаты ${formatPct(weekly.other_payment_rate ?? weekly.alt_payment)}.`,
    );
  }

  const bestWeek = series.reduce((best, row) => (Number(row[result.metric] || 0) > Number(best?.[result.metric] || -1) ? row : best), null);
  if (bestWeek) {
    insights.push(`Лучшее значение метрики в периоде: ${formatPct(bestWeek[result.metric])} на неделе ${bestWeek.week}.`);
  }

  return insights;
}

function renderAi(result) {
  const narrative = buildAiNarrative(result);
  elements.aiSummary.innerHTML = `
    <div class="ai-callout">${escapeHtml(narrative.lead)} ${escapeHtml(narrative.reason)}</div>
    <ul class="ai-list">
      <li>${escapeHtml(narrative.balancing)}</li>
      ${narrative.charts.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      ${narrative.recs.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      <li>Диагностика: новые пользователи ${formatPct(result.diagnostics.new_user_share)}, банковские офферы ${formatPct(result.diagnostics.bank_offer_share)}, альтернативные оплаты ${formatPct(result.diagnostics.alt_payment_share)}.</li>
    </ul>
  `;

  if (activeContextId !== result.id) {
    activeContextId = result.id;
    chatMessages = [
      {
        role: "ai",
        text: `${result.week}, ${result.vertical}: ${narrative.lead}`,
      },
    ];
  }
  renderChat();
}

function answerQuestion(question, result) {
  const q = question.toLowerCase();
  const narrative = buildAiNarrative(result);
  const topNegative = result.top_negative_factors.slice(0, 3);
  const topPositive = result.top_positive_factors.slice(0, 3);

  if (q.includes("данн") || q.includes("нужн")) {
    return "Для финальной версии нужны четыре слоя: сырые транзакции, агрегаты по неделям и сегментам, справочники продуктовых измерений и JSON с результатом факторного анализа. В этом прототипе уже используются агрегаты, сырые транзакции для паспорта данных и факторный JSON, рассчитанный локально.";
  }

  if (q.includes("waterfall") || q.includes("водопад") || q.includes("декомпоз")) {
    return narrative.charts[0] || "Waterfall показывает стартовое значение, вклад факторов и итоговое значение выбранной метрики.";
  }

  if (q.includes("объем") || q.includes("объём") || q.includes("gmv") || q.includes("заказ")) {
    return narrative.charts.find((item) => item.startsWith("Объемы")) || "График объемов нужен, чтобы отличить реальное изменение метрики от эффекта малой базы.";
  }

  if (q.includes("donut") || q.includes("микс") || q.includes("платеж")) {
    return narrative.charts.find((item) => item.startsWith("Платежный микс")) || "Кольцевая диаграмма показывает долю кредитной карты, BNPL и альтернативных оплат за выбранную неделю.";
  }

  if (q.includes("отчет") || q.includes("сводк")) {
    const factors = (result.delta < 0 ? topNegative : topPositive)
      .map((item) => `${item.dimension_label}: ${item.segment_label} (${formatPp(item.contribution)})`)
      .join("; ");
    return `${narrative.lead} ${narrative.reason} Факторы: ${factors || "нет выраженных факторов"}. ${narrative.charts.slice(0, 2).join(" ")} Следующее действие: ${recommendationForFactor((result.delta < 0 ? topNegative : topPositive)[0])}`;
  }

  if (q.includes("провер") || q.includes("делать") || q.includes("гипот")) {
    const factors = result.delta < 0 ? topNegative : topPositive;
    return factors.map((item, index) => `${index + 1}. ${recommendationForFactor(item)}`).join(" ");
  }

  if (q.includes("почему") || q.includes("прич")) {
    const factors = result.delta < 0 ? topNegative : topPositive;
    const list = factors
      .map((item) => `${item.dimension_label} / ${item.segment_label}: ${formatPp(item.contribution)}, доля ${formatPct(item.share)}`)
      .join("; ");
    return `${narrative.lead} Наиболее вероятное объяснение: ${list || "факторы распределены без одного явного лидера"}.`;
  }

  return `${narrative.lead} ${narrative.reason} Для следующего шага я бы проверил: ${recommendationForFactor((result.delta < 0 ? topNegative : topPositive)[0])}`;
}

function renderChat() {
  elements.chatBox.innerHTML = "";
  chatMessages.forEach((message) => {
    const node = document.createElement("div");
    node.className = `message ${message.role}`;
    node.textContent = message.text;
    elements.chatBox.appendChild(node);
  });
  elements.chatBox.scrollTop = elements.chatBox.scrollHeight;
}

function askAi(question) {
  if (!question) return;
  const result = getResult();
  chatMessages.push({ role: "user", text: question });
  chatMessages.push({ role: "ai", text: answerQuestion(question, result) });
  renderChat();
}

function buildPrompt(result) {
  const payload = {
    task: "Сформировать аналитическое объяснение изменения продуктовой метрики и предложить гипотезы",
    language: "ru",
    context: {
      week: result.week,
      previous_week: result.prev_week,
      vertical: result.vertical,
      metric: result.metric_label,
      value: result.metric_value,
      previous_value: result.prev_value,
      delta: result.delta,
      delta_pct: result.delta_pct,
      top_negative_factors: result.top_negative_factors,
      top_positive_factors: result.top_positive_factors,
      waterfall_steps: buildWaterfallSteps(result).map((step) => ({
        type: step.type,
        label: step.fullLabel || step.label,
        value: step.value,
      })),
      weekly_volume: getWeeklyRecord(result.week, result.vertical),
      chart_insights: buildChartInsights(result),
      diagnostics: result.diagnostics,
    },
    expected_output: ["краткая причина", "2-3 гипотезы", "что проверить в данных", "рекомендация для продакта"],
  };
  return `Ты продуктовый аналитик. Используй только переданный контекст и не придумывай факты.\n\n${JSON.stringify(payload, null, 2)}`;
}

async function copyPrompt() {
  const prompt = buildPrompt(getResult());
  try {
    await navigator.clipboard.writeText(prompt);
    elements.copyPrompt.textContent = "Prompt скопирован";
  } catch {
    const area = document.createElement("textarea");
    area.value = prompt;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    elements.copyPrompt.textContent = "Prompt скопирован";
  }
  setTimeout(() => {
    elements.copyPrompt.textContent = "Скопировать LLM prompt";
  }, 1600);
}

function colorForDelta(value, maxAbs) {
  const normalized = Math.min(Math.abs(value) / (maxAbs || 0.001), 1);
  const alpha = 0.25 + normalized * 0.75;
  if (value < -0.000001) return `rgba(238, 106, 99, ${alpha})`;
  if (value > 0.000001) return `rgba(87, 197, 155, ${alpha})`;
  return "rgba(183, 187, 181, 0.45)";
}

function renderHeatmap() {
  const weeks = DATA.meta.weeks.slice(1);
  const verticals = DATA.meta.verticals.filter((value) => value !== "Все вертикали");
  const deltas = DATA.weekly
    .filter((row) => verticals.includes(row.vertical) && weeks.includes(row.week))
    .map((row) => Number(row[`${state.metric}_delta`] || 0));
  const maxAbs = Math.max(...deltas.map((value) => Math.abs(value)), 0.001);

  const grid = document.createElement("div");
  grid.className = "heatmap-grid";
  grid.style.gridTemplateColumns = `142px repeat(${weeks.length}, 78px)`;
  grid.appendChild(heatmapCell("", "header"));
  weeks.forEach((week) => grid.appendChild(heatmapCell(week.slice(5), "header")));

  verticals.forEach((vertical) => {
    grid.appendChild(heatmapCell(vertical, "side"));
    weeks.forEach((week) => {
      const row = getWeeklyRecord(week, vertical);
      const delta = Number(row?.[`${state.metric}_delta`] || 0);
      const cell = heatmapCell(formatPp(delta).replace(" п.п.", ""), "");
      cell.style.background = colorForDelta(delta, maxAbs);
      cell.title = `${week} · ${vertical}: ${formatPp(delta)}`;
      cell.addEventListener("click", () => {
        state.week = week;
        state.vertical = vertical;
        syncSelects();
        render();
      });
      grid.appendChild(cell);
    });
  });

  elements.heatmap.innerHTML = "";
  elements.heatmap.appendChild(grid);
}

function heatmapCell(text, modifier) {
  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = `heatmap-cell ${modifier}`;
  cell.textContent = text;
  return cell;
}

function renderAlerts() {
  const alerts = DATA.alerts.slice(0, 14);
  elements.alertsList.innerHTML = "";
  alerts.forEach((alert) => {
    const button = document.createElement("button");
    button.type = "button";
    const active = alert.week === state.week && alert.vertical === state.vertical && alert.metric === state.metric;
    button.className = `alert-item ${active ? "active" : ""}`;
    const tone = alert.delta < 0 ? "negative" : "positive";
    button.innerHTML = `
      <div>
        <div class="alert-title">${escapeHtml(alert.vertical)} · ${escapeHtml(alert.metric_label)}</div>
        <div class="alert-meta">${escapeHtml(alert.week)} · ${escapeHtml(alert.dimension)} / ${escapeHtml(alert.factor)}</div>
      </div>
      <div class="alert-delta ${tone}">${formatPp(alert.delta)}</div>
    `;
    button.addEventListener("click", () => {
      state.week = alert.week;
      state.vertical = alert.vertical;
      state.metric = alert.metric;
      syncSelects();
      render();
    });
    elements.alertsList.appendChild(button);
  });
}

function renderVerticalCompare() {
  const metric = state.metric;
  const metricLabel = metricById(metric).label;
  const rows = DATA.weekly
    .filter((row) => row.week === state.week && row.vertical !== "Все вертикали")
    .map((row) => ({
      vertical: row.vertical,
      value: Number(row[metric] || 0),
      delta: Number(row[`${metric}_delta`] || 0),
    }))
    .sort((a, b) => b.value - a.value);
  const max = Math.max(...rows.map((row) => row.value), 0.001);

  elements.verticalCompareSubtitle.textContent = `${state.week}: ${metricLabel}`;
  elements.verticalCompareChart.innerHTML = rows
    .map((row) => {
      const width = Math.max(4, (row.value / max) * 100);
      const active = row.vertical === state.vertical ? " active" : "";
      return `
        <button class="ranking-row${active}" type="button" data-vertical="${escapeHtml(row.vertical)}">
          <span class="ranking-name">${escapeHtml(row.vertical)}</span>
          <span class="ranking-track"><span class="ranking-fill" style="width:${width}%"></span></span>
          <span class="ranking-value ${signedClass(row.delta)}">${formatPct(row.value)}</span>
        </button>
      `;
    })
    .join("");

  elements.verticalCompareChart.querySelectorAll("[data-vertical]").forEach((button) => {
    button.addEventListener("click", () => {
      state.vertical = button.dataset.vertical;
      syncSelects();
      render();
    });
  });
}

function renderPaymentMix() {
  const rows = DATA.weekly.filter((row) => row.vertical === state.vertical);
  elements.paymentMixChart.innerHTML = `
    <div class="chart-legend">
      <span><i class="legend-dot" style="background:var(--blue)"></i>Кредитная карта</span>
      <span><i class="legend-dot" style="background:var(--yellow)"></i>BNPL</span>
      <span><i class="legend-dot" style="background:var(--red)"></i>Альтернативные</span>
    </div>
    ${rows
      .map((row) => {
        const cc = Math.max(0, Number(row.credit_card_rate || 0));
        const bnpl = Math.max(0, Number(row.bnpl_rate || 0));
        const alt = Math.max(0, Number(row.other_payment_rate ?? row.alt_payment ?? 0));
        const total = Math.max(cc + bnpl + alt, 0.001);
        return `
          <div class="mix-row" title="${row.week}: CC ${formatPct(cc)}, BNPL ${formatPct(bnpl)}, Alt ${formatPct(alt)}">
            <span class="mix-label">${escapeHtml(row.week.slice(5))}</span>
            <span class="mix-track">
              <span class="mix-segment cc" style="width:${(cc / total) * 100}%"></span>
              <span class="mix-segment bnpl" style="width:${(bnpl / total) * 100}%"></span>
              <span class="mix-segment alt" style="width:${(alt / total) * 100}%"></span>
            </span>
          </div>
        `;
      })
      .join("")}
  `;
}

function shortFactorLabel(item) {
  const segment = item.segment_label.length > 18 ? `${item.segment_label.slice(0, 16)}…` : item.segment_label;
  return `${item.dimension_label.split(" ")[0]} · ${segment}`;
}

function buildWaterfallSteps(result) {
  const sourceFactors = result.waterfall_factors?.length ? result.waterfall_factors : result.factors;
  const grouped = sourceFactors.reduce((acc, item) => {
    const key = item.dimension || "factor";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const groups = Object.values(grouped)
    .map((items) => ({
      items,
      sum: items.reduce((sum, item) => sum + Number(item.contribution || 0), 0),
      label: items[0]?.dimension_label || "Фактор",
    }))
    .sort((a, b) => Math.abs(Number(result.delta || 0) - a.sum) - Math.abs(Number(result.delta || 0) - b.sum));
  const chosenGroup = groups[0] || { items: [], sum: 0, label: "Фактор" };
  const factors = chosenGroup.items.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 8);
  const shownSum = factors.reduce((sum, item) => sum + Number(item.contribution || 0), 0);
  const residual = Number(result.delta || 0) - shownSum;
  const contributionSteps = factors.map((item) => ({
    type: "factor",
    label: shortFactorLabel(item),
    fullLabel: `${item.dimension_label} · ${item.segment_label}`,
    value: Number(item.contribution || 0),
  }));
  if (Math.abs(residual) > 0.000001 || contributionSteps.length === 0) {
    contributionSteps.push({
      type: "residual",
      label: "Прочие",
      fullLabel: "Прочие факторы / остаток до фактической дельты",
      value: residual,
    });
  }
  return [
    { type: "start", label: "Старт", fullLabel: result.prev_week, value: Number(result.prev_value || 0) },
    ...contributionSteps,
    { type: "end", label: "Итог", fullLabel: result.week, value: Number(result.metric_value || 0) },
  ].map((step) => (step.type === "factor" || step.type === "residual" ? { ...step, groupLabel: chosenGroup.label } : step));
}

function renderWaterfall(result) {
  const steps = buildWaterfallSteps(result);
  const width = 900;
  const height = 292;
  const margin = { top: 24, right: 24, bottom: 58, left: 54 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const values = [Number(result.prev_value || 0), Number(result.metric_value || 0)];
  let cumulative = Number(result.prev_value || 0);
  const barData = steps.map((step, index) => {
    if (step.type === "start") {
      return { ...step, index, from: 0, to: step.value };
    }
    if (step.type === "end") {
      return { ...step, index, from: 0, to: step.value };
    }
    const from = cumulative;
    cumulative += step.value;
    values.push(from, cumulative);
    return { ...step, index, from, to: cumulative };
  });

  let min = Math.min(...values);
  let max = Math.max(...values);
  const pad = Math.max((max - min) * 0.18, 0.015);
  min = Math.max(0, min - pad);
  max = Math.min(1, max + pad);
  if (Math.abs(max - min) < 0.02) max = min + 0.02;

  const xStep = plotW / steps.length;
  const barW = clamp(xStep * 0.58, 28, 72);
  const y = (value) => margin.top + plotH - ((value - min) / (max - min || 1)) * plotH;
  const baseline = y(min);
  const bars = barData
    .map((step) => {
      const x = margin.left + step.index * xStep + (xStep - barW) / 2;
      const drawFrom = step.type === "start" || step.type === "end" ? min : step.from;
      const y1 = y(Math.max(drawFrom, step.to));
      const y2 = y(Math.min(drawFrom, step.to));
      const h = Math.max(2, y2 - y1);
      const fill =
        step.type === "start" || step.type === "end"
          ? "#66a6ff"
          : step.value >= 0
            ? "#57c59b"
            : "#ee6a63";
      const valueLabel = step.type === "start" || step.type === "end" ? formatPct(step.value) : formatPp(step.value);
      return `
        <g>
          <title>${escapeHtml(step.fullLabel)}: ${escapeHtml(valueLabel)}</title>
          <rect x="${x}" y="${y1}" width="${barW}" height="${h}" rx="5" fill="${fill}"></rect>
          <text x="${x + barW / 2}" y="${Math.max(14, y1 - 7)}" text-anchor="middle" class="waterfall-value">${escapeHtml(valueLabel)}</text>
          <text x="${x + barW / 2}" y="${height - 30}" text-anchor="middle" class="waterfall-label">${escapeHtml(step.label)}</text>
        </g>
      `;
    })
    .join("");

  const connectors = barData
    .slice(1, -1)
    .map((step, index) => {
      const prev = barData[index];
      const x1 = margin.left + prev.index * xStep + (xStep + barW) / 2;
      const x2 = margin.left + step.index * xStep + (xStep - barW) / 2;
      const yy = y(step.from);
      return `<line x1="${x1}" y1="${yy}" x2="${x2}" y2="${yy}" stroke="#666c67" stroke-dasharray="4 5"></line>`;
    })
    .join("");

  const contributionSum = steps
    .filter((step) => step.type === "factor" || step.type === "residual")
    .reduce((sum, step) => sum + step.value, 0);
  const residual = steps.find((step) => step.type === "residual")?.value || 0;
  const groupLabel = steps.find((step) => step.groupLabel)?.groupLabel || "факторы";
  elements.waterfallSubtitle.textContent = `${result.prev_week} → ${result.week}: ${formatPct(result.prev_value)} → ${formatPct(result.metric_value)}, разрез «${groupLabel}»`;
  elements.waterfallChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Водопад декомпозиции">
      <line x1="${margin.left}" y1="${baseline}" x2="${width - margin.right}" y2="${baseline}" stroke="#3b3f3d"></line>
      <text x="8" y="${y(max) + 5}" class="waterfall-label">${formatPct(max, 0)}</text>
      <text x="8" y="${baseline}" class="waterfall-label">${formatPct(min, 0)}</text>
      ${connectors}
      ${bars}
    </svg>
    <p class="waterfall-caption">Сходимость: ${formatPp(contributionSum)} = фактическая дельта ${formatPp(result.delta)}${Math.abs(residual) > 0.000001 ? `; «Прочие» закрывают ${formatPp(residual)}` : ""}.</p>
  `;
}

function renderVolumeChart() {
  const rows = DATA.weekly.filter((row) => row.vertical === state.vertical);
  if (!rows.length) {
    elements.volumeChart.innerHTML = `<p class="ai-callout">Нет данных для выбранной вертикали.</p>`;
    return;
  }
  const width = 760;
  const height = 292;
  const margin = { top: 24, right: 58, bottom: 42, left: 52 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const maxOrders = Math.max(...rows.map((row) => Number(row.orders || 0)), 1);
  const maxGmv = Math.max(...rows.map((row) => Number(row.gmv || 0)), 1);
  const xStep = plotW / rows.length;
  const barW = clamp(xStep * 0.48, 10, 30);
  const yOrders = (value) => margin.top + plotH - (value / maxOrders) * plotH;
  const yGmv = (value) => margin.top + plotH - (value / maxGmv) * plotH;
  const bars = rows
    .map((row, index) => {
      const x = margin.left + index * xStep + (xStep - barW) / 2;
      const y = yOrders(row.orders);
      const active = row.week === state.week;
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${margin.top + plotH - y}" rx="4" fill="${active ? "#f5d84e" : "#66a6ff"}" opacity="${active ? "0.95" : "0.55"}">
          <title>${row.week}: ${formatInt(row.orders)} заказов</title>
        </rect>
      `;
    })
    .join("");
  const points = rows
    .map((row, index) => `${margin.left + index * xStep + xStep / 2},${yGmv(row.gmv)}`)
    .join(" ");
  const labels = rows
    .map((row, index) => {
      if (index % 2 !== 0 && index !== rows.length - 1) return "";
      return `<text x="${margin.left + index * xStep + xStep / 2}" y="${height - 12}" text-anchor="middle" class="volume-label">${row.week.slice(5)}</text>`;
    })
    .join("");

  elements.volumeChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Заказы и GMV">
      <line x1="${margin.left}" y1="${margin.top + plotH}" x2="${width - margin.right}" y2="${margin.top + plotH}" stroke="#3b3f3d"></line>
      <text x="8" y="${margin.top + 5}" class="volume-label">${formatInt(maxOrders)} заказов</text>
      <text x="${width - margin.right + 8}" y="${margin.top + 5}" class="volume-label">${formatMoneyShort(maxGmv)} ₽</text>
      ${bars}
      <polyline points="${points}" fill="none" stroke="#57c59b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${rows
        .map((row, index) => `<circle cx="${margin.left + index * xStep + xStep / 2}" cy="${yGmv(row.gmv)}" r="${row.week === state.week ? 5 : 3}" fill="#57c59b"><title>${row.week}: ${formatMoney(row.gmv)}</title></circle>`)
        .join("")}
      ${labels}
    </svg>
    <div class="chart-legend">
      <span><i class="legend-dot" style="background:var(--blue)"></i>Заказы</span>
      <span><i class="legend-dot" style="background:var(--green)"></i>GMV</span>
    </div>
  `;
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function renderDonut() {
  const weekly = getWeeklyRecord();
  if (!weekly) {
    elements.donutChart.innerHTML = `<p class="ai-callout">Нет данных для выбранной недели.</p>`;
    return;
  }
  const slices = [
    { label: "Кредитная карта", value: Number(weekly.credit_card_rate || 0), color: "#66a6ff" },
    { label: "BNPL", value: Number(weekly.bnpl_rate || 0), color: "#f5d84e" },
    { label: "Альтернативные", value: Number(weekly.other_payment_rate ?? weekly.alt_payment ?? 0), color: "#ee6a63" },
  ];
  const total = Math.max(slices.reduce((sum, item) => sum + item.value, 0), 0.001);
  let angle = 0;
  const arcs = slices
    .map((slice) => {
      const start = angle;
      angle += (slice.value / total) * 360;
      const end = angle;
      return `
        <path d="${describeArc(130, 126, 86, start, end)}" fill="none" stroke="${slice.color}" stroke-width="30" stroke-linecap="butt">
          <title>${slice.label}: ${formatPct(slice.value)}</title>
        </path>
      `;
    })
    .join("");
  elements.donutSubtitle.textContent = `${state.vertical}, ${state.week}`;
  elements.donutChart.innerHTML = `
    <svg viewBox="0 0 260 292" role="img" aria-label="Кольцевая диаграмма платежного микса">
      ${arcs}
      <text x="130" y="120" text-anchor="middle" class="donut-value">${formatPct(weekly.target_rate)}</text>
      <text x="130" y="140" text-anchor="middle" class="donut-label">целевые</text>
      <text x="130" y="276" text-anchor="middle" class="donut-label">${formatInt(weekly.orders)} заказов</text>
    </svg>
    <div class="chart-legend">
      ${slices.map((slice) => `<span><i class="legend-dot" style="background:${slice.color}"></i>${escapeHtml(slice.label)} ${formatPct(slice.value)}</span>`).join("")}
    </div>
  `;
}

function renderFactorTable(result) {
  elements.tableSubtitle.textContent = `${result.vertical}, ${result.metric_label}: ${result.prev_week} → ${result.week}`;
  elements.factorTable.innerHTML = result.factors
    .slice(0, 14)
    .map((item) => {
      const tone = signedClass(item.contribution);
      const hasSegmentRate = hasNumber(item.segment_rate) && hasNumber(item.prev_segment_rate);
      const rateDelta = hasSegmentRate ? item.segment_rate - item.prev_segment_rate : null;
      return `
        <tr>
          <td>${escapeHtml(item.dimension_label)}</td>
          <td>${escapeHtml(item.segment_label)}</td>
          <td class="${tone}">${formatPp(item.contribution)}</td>
          <td>${formatPct(item.share)}</td>
          <td>${hasSegmentRate ? formatPct(item.segment_rate) : "—"}</td>
          <td class="${hasSegmentRate ? signedClass(rateDelta) : ""}">${hasSegmentRate ? formatPp(rateDelta) : "—"}</td>
        </tr>
      `;
    })
    .join("");
}

function render() {
  const result = getResult();
  const weekly = getWeeklyRecord(result.week, result.vertical);
  state.week = result.week;
  state.vertical = result.vertical;
  state.metric = result.metric;
  syncSelects();

  elements.pageTitle.textContent = `${result.vertical}: ${result.metric_label}`;
  renderKpis(result, weekly);
  renderTrend(result);
  renderFactorBars(result);
  renderAi(result);
  renderHeatmap();
  renderAlerts();
  renderVerticalCompare();
  renderPaymentMix();
  renderWaterfall(result);
  renderVolumeChart();
  renderDonut();
  renderFactorTable(result);
}

renderSourceMeta();
initControls();
render();
