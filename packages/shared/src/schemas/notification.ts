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
