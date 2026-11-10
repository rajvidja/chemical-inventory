import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n.toLocaleString()} ${n === 1 ? word : pluralWord}`;
}

export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Whole days from today (local) until a YYYY-MM-DD date; negative when past. */
export function daysUntil(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const today = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000);
}

export function expiryText(days: number) {
  if (days < 0) return `Expired ${-days} d ago`;
  if (days === 0) return "Expires today";
  return `Expires in ${days} d`;
}

export function formatDate(date: string, withYear = true) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: withYear ? "numeric" : undefined });
}

export function formatPct(p: number | null | undefined) {
  if (p === null || p === undefined) return "—";
  return `${Math.round(p * 10) / 10}%`;
}
