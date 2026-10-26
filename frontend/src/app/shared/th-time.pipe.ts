import { formatDate } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';

/** Data is stored in UTC; show Thai time (UTC+7). */
@Pipe({ name: 'thTime' })
export class ThTimePipe implements PipeTransform {
  transform(value: string | null | undefined, format = 'dd/MM/yyyy HH:mm:ss'): string {
    return value ? formatDate(value, format, 'en-US', '+0700') : '-';
  }
}

@Pipe({ name: 'ago', pure: false })
export class AgoPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '-';
    const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return `${seconds} วินาทีที่แล้ว`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} นาทีที่แล้ว`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} ชม. ที่แล้ว`;
    return `${Math.floor(seconds / 86400)} วันที่แล้ว`;
  }
}

export function duration(from: string, to: string | null): string {
  const seconds = Math.round(((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}ชม. ${m}น.` : m ? `${m}น. ${s}วิ` : `${s}วิ`;
}
