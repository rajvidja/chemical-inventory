import type { StockStatus, Thresholds } from "./stock";
import type { RowIssue, RawRow } from "./importParse";

export interface CategoryRef {
  id: number;
  slug: string;
  name: string;
  color: string;
  icon: string;
  parentSlug: string | null;
  parentName: string | null;
  isPrimary: boolean;
  source: string;
}

export interface ContainerSummary {
  id: number;
  brand: string | null;
  packSize: string | null;
  packValue: number | null;
  packUnit: string | null;
  remainingPercentage: number | null;
  remainingQuantity: number | null;
  location: string | null;
  locationId: number | null;
  status: StockStatus;
  needsReview: boolean;
  raw: { brand: string | null; packSize: string | null; availability: string | null; location: string | null } | null;
  mentionedLocations: string[];
  notes: string | null;
  expiryDate: string | null;
  sourceExcelRow: number | null;
  updatedAt: string;
}

export type AlertPriority = "critical" | "watchlist";

export interface OpenOrder {
  id: number;
  supplier: string | null;
  orderedOn: string;
  expectedOn: string | null;
  notes: string | null;
}

export type MatchField = "name" | "synonym" | "cas" | "location" | "brand" | "category" | "tag" | "class" | "text";

export interface ChemicalListItem {
  id: number;
  name: string;
  cas: string | null;
  casValid: boolean;
  formula: string | null;
  chemicalClass: string | null;
  status: StockStatus;
  bestPct: number | null;
  containerCount: number;
  reviewCount: number;
  categories: CategoryRef[];
  containers: ContainerSummary[];
  priority: AlertPriority | null;
  order: OpenOrder | null;
  match: { field: MatchField; text: string; score: number } | null;
  updatedAt: string;
}

export interface SearchFilters {
  categories?: string[];
  categoryMode?: "any" | "all";
  brands?: string[];
  statuses?: StockStatus[];
  locations?: string[];
  classes?: string[];
  tags?: string[];
}

export type SortKey = "relevance" | "name" | "cas" | "availability_desc" | "availability_asc" | "location" | "brand" | "updated";

export interface SearchResponse {
  items: ChemicalListItem[];
  total: number;
  tookMs: number;
}

export interface SuggestResponse {
  chemicals: ChemicalListItem[];
  locations: { name: string; count: number }[];
  brands: { name: string; count: number }[];
  categories: { slug: string; name: string; color: string; icon: string; count: number }[];
  tookMs: number;
}

export interface CategoryNode {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  parentId: number | null;
  isSystem: boolean;
  chemicalCount: number;
  children: CategoryNode[];
  topTags: string[];
}

export interface Facet {
  value: string;
  count: number;
}

export interface MetaResponse {
  thresholds: Thresholds;
  categories: CategoryNode[];
  locations: { id: number; name: string; description: string | null; chemicalCount: number; containerCount: number }[];
  brands: Facet[];
  classes: Facet[];
  tags: Facet[];
  reviewCount: number;
}

export interface ChemicalDetail extends ChemicalListItem {
  iupacName: string | null;
  molecularWeight: number | null;
  /** g/cm³. Null when PubChem reports no density. */
  density: number | null;
  /** Phase at 25 °C. */
  phase: "solid" | "liquid" | "gas" | null;
  pubchemCid: number | null;
  identitySource: string | null;
  classificationSource: string;
  hazardClassification: string | null;
  hazardSource: string | null;
  description: string | null;
  notes: string | null;
  synonyms: { id: number; synonym: string; source: string }[];
  tags: string[];
  importRecords: {
    id: number;
    originalRow: number;
    status: string;
    raw: RawRow;
    issues: RowIssue[];
    resolvedAt: string | null;
    fileName: string;
  }[];
  sameCas: { id: number; name: string; containerCount: number }[];
  activity: { id: number; action: string; detail: Record<string, unknown>; createdAt: string }[];
  createdAt: string;
}

export interface InventoryStats {
  totalRecords: number;
  uniqueChemicals: number;
  totalContainers: number;
  available: number;
  good: number;
  moderate: number;
  low: number;
  out: number;
  unknown: number;
  categories: number;
  locations: number;
  needsReview: number;
}

/** A chemical whose best container is low or out, i.e. one that may need reordering. */
export interface ReorderItem {
  chemicalId: number;
  name: string;
  status: StockStatus;
  bestPct: number | null;
  location: string | null;
  priority: AlertPriority | null;
  order: OpenOrder | null;
}

export interface ExpiryItem {
  containerId: number;
  chemicalId: number;
  name: string;
  brand: string | null;
  location: string | null;
  expiryDate: string;
  daysLeft: number;
}

export interface DashboardResponse {
  stats: InventoryStats;
  /** Counts exclude chemicals that already have an open order. */
  attention: { out: number; low: number; critical: number; ordered: number; needsReview: number; expired: number; expiringSoon: number };
  /** Change in out + low + needs review since the latest earlier daily snapshot; null until one exists. */
  trend: { attentionDelta: number | null; since: string | null };
  recent: ChemicalListItem[];
  reorder: ReorderItem[];
  expiring: ExpiryItem[];
}

export interface InsightsResponse {
  stats: InventoryStats;
  categoryDistribution: { slug: string; name: string; color: string; count: number }[];
  statusDistribution: { status: StockStatus; count: number }[];
  weeklyActivity: { week: string; updates: number; added: number }[];
  topSearches: { query: string; n: number }[];
  /** Daily snapshots of the last 30 days, oldest first. Recording started with this release. */
  history: { day: string; low: number; out: number; needsReview: number }[];
}

export interface HazardConflict {
  chemicalId: number;
  name: string;
  reason: string;
}

export interface AlertItem {
  containerId: number;
  chemicalId: number;
  chemicalName: string;
  cas: string | null;
  brand: string | null;
  packSize: string | null;
  remainingPercentage: number | null;
  remainingQuantity: number | null;
  packUnit: string | null;
  location: string | null;
  status: StockStatus;
  otherAvailable: number;
  priority: AlertPriority | null;
  order: OpenOrder | null;
}
