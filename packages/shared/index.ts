export type PaymentStatus = 'PENDING'|'PAID'|'FAILED'|'REFUNDED';
export type OrderStatus = 'PENDING_PAYMENT'|'CONFIRMED'|'PROCESSING'|'SHIPPED'|'OUT_FOR_DELIVERY'|'DELIVERED'|'CANCELLED';
export type ConversationMode = 'AI'|'HUMAN'|'CLOSED';
export const orderStatuses: OrderStatus[] = ['PENDING_PAYMENT','CONFIRMED','PROCESSING','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'];
