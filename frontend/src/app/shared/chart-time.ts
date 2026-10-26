import { formatDate } from '@angular/common';

// Charts always show Thai time (UTC+7), whatever timezone the viewer's browser uses.
const th = (v: number | string, f: string) => formatDate(v, f, 'en-US', '+0700');

export const thaiTimeAxis = {
  type: 'time',
  axisLabel: { formatter: (v: number) => th(v, 'HH:mm'), hideOverlap: true },
  axisPointer: { label: { formatter: (p: { value: number }) => th(p.value, 'dd/MM HH:mm:ss') } },
};

interface TooltipParam {
  marker: string;
  seriesName: string;
  value: [string, number];
}

export function thaiTooltip(unit = '') {
  return {
    trigger: 'axis',
    formatter: (params: TooltipParam[]) =>
      params.length
        ? `${th(params[0].value[0], 'dd/MM/yyyy HH:mm:ss')}<br>` +
          params.map((p) => `${p.marker}${p.seriesName}: <b>${p.value[1]}</b> ${unit}`).join('<br>')
        : '',
  };
}
