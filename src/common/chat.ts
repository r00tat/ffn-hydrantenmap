export interface ChatMessage {
  id?: string;
  uid: string;
  email?: string;
  name?: string;
  message: string;
  timestamp: string;
  picture?: string;
}
