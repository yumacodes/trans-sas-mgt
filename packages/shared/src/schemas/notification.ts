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
