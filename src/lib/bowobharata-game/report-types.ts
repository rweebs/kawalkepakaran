// The chapter reports' data (GameData.report): the counts, chart bins and record map behind the Tercatat, Sanjaya and
// finale screens. report-build.ts builds it at build time from the dossier, PARVAS and the linimasa. It adds no facts of
// its own and leaves category E out. Imports are type-only, so the island bundles none of the builders.
import type { Tahap } from '../perkara';

/** A count over time. `key` is 'YYYY-MM' for month bins and 'YYYY-MM-DD' for day bins. */
export interface Bin { key: string; n: number }

/** A labelled count, e.g. a pasal and the number of names citing it. */
export interface Count { label: string; n: number }

/** One chapter's report, indexed like GameData.chapters (0 = prologue, last = finale). */
export interface ChapterReport {
  /** Names with an entry in this chapter: those new to the record (`fresh`, the full entries) and those seen before (`again`). */
  names: number;
  fresh: number;
  again: number;
  /** The counted rows of those entries, fresh and again alike: Perbuatan, then Tanggapan. */
  acts: number;
  replies: number;
  /** Every pasal cited by those names, most cited first, with ties in label order. `n` is the number of names citing it. */
  pasal: Count[];
  /** The number of distinct police report numbers listed on those names. */
  reports: number;
  /** tahapan() over those names. */
  stages: Tahap[];
  /**
   * The counted rows by date. A parva gets day bins, one for every day of its window. The prologue and the finale chapter
   * get month bins, one for every month from the first dated row to the last. A row dated more coarsely than the unit
   * counts in `undated`. A chapter with no rows has no bins.
   */
  unit: 'day' | 'month';
  bins: Bin[];
  undated: number;
}

/** A node of the record map, mirroring the /pantau graph node (GNode in src/lib/relasi.ts) it comes from. */
export interface MapNode {
  /** The /pantau graph id: 'rw', 'perkara', 'pk:A', 'tl:T-001', 'laporan', 'lp:out', 'lp:in', 'lp:LP-02'. */
  id: string;
  kind: 'center' | 'hub' | 'cluster' | 'member';
  source: 'rw' | 'perkara' | 'laporan';
  /** The /pantau label: a name, a category, a group or a report number. Screens show it only inside the framed report block. */
  label: string;
  /** The chapter (a GameData.chapters index) in which the node first appears on the map. */
  chapter: number;
}

export type MapLinkKind = 'in-allegation' | 'out-response' | 'against' | 'member';

/** One link per node pair, as layout3d builds them. `a` and `b` index MapGraph.nodes; `chapter` is the later of their chapters. */
export interface MapLink { a: number; b: number; kind: MapLinkKind; chapter: number }

/**
 * The record map: the terlapor and police-report part of the /pantau graph, with category E left out, laid out once by
 * layout3d (src/lib/relasi-3d.ts). `pos` holds x, y and z for each node, rounded to 0.01. `radius` is the layout's extent.
 */
export interface MapGraph { nodes: MapNode[]; links: MapLink[]; pos: number[]; radius: number }

/** One police report: its short number (Laporan.no), its date and its direction. It names nobody. */
export interface ReportDot { no: string; date: string | null; dir: 'by' | 'against' }

export interface ReportData {
  /**
   * The whole story's span. It runs from the first day of the month of the earliest dated counted row (rows dated only to a
   * year are left out) to whichever comes later: the last parva window's end or the last dated counted row.
   */
  span: { from: string; to: string };
  /** The whole record's counted rows per month over the span, every month included. Rows dated only to a year count in `undated`. */
  months: Bin[];
  undated: number;
  /** The parva windows (parvaWindow); index 0 is parva 1. */
  windows: { from: string; to: string }[];
  chapters: ChapterReport[];
  /** The names first recorded in each chapter (its full entries), indexed like `chapters`. */
  fresh: number[];
  /** The whole record, category E left out: pasal most cited first, and tahapan(). */
  pasal: Count[];
  stages: Tahap[];
  /** Every police report, ordered by date (undated last), then by number. */
  reports: ReportDot[];
  map: MapGraph;
}
