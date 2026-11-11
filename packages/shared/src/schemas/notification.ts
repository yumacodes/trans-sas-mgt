export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string | null;
  /** Page the notification opens. */
  link: string | null;
  read: boolean;
  createdAt: string;
}

/** One match from the top-bar search. */
export interface SearchResultDto {
  kind: string;
  id: string;
  title: string;
  detail: string | null;
  /** Page that opens the record. */
  link: string;
}

/** Outcome of one spreadsheet row; `row` is its row number in the sheet. */
export interface ImportRowResult {
  row: number;
  status: 'valid' | 'error' | 'duplicate';
  message: string | null;
}

export interface ImportResultDto {
  /** False for a check, true once valid rows were saved. */
  committed: boolean;
  created: number;
  valid: number;
  invalid: number;
  duplicates: number;
  results: ImportRowResult[];
}
