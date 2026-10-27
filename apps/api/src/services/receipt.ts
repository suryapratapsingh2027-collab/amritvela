import PDFDocument from 'pdfkit';

const TRUST_NAME = 'Amrit Vela Trust';
const TRUST_ADDRESS = 'Amrit Vela Darbar, Section 26, Ulhasnagar-4, Maharashtra';
const TRUST_CONTACT = '6913001300 | amritvelatrustlive@gmail.com';

function render(build: (d: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const d = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    d.on('data', (c: Buffer) => chunks.push(c));
    d.on('end', () => resolve(Buffer.concat(chunks)));
    d.on('error', reject);
    try {
      build(d);
      d.end();
    } catch (e) {
      reject(e);
    }
  });
}

function fmtDate(value?: Date | string | null): string {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
}

function header(d: PDFKit.PDFDocument, title: string) {
  d.fontSize(20).font('Helvetica-Bold').text(TRUST_NAME, { align: 'center' });
  d.fontSize(9).font('Helvetica').fillColor('#444').text(TRUST_ADDRESS, { align: 'center' }).text(TRUST_CONTACT, { align: 'center' });
  d.moveDown(1.2).fillColor('#000').fontSize(16).font('Helvetica-Bold').text(title, { align: 'center' });
  d.moveDown(0.8).font('Helvetica').fontSize(11);
}

function row(d: PDFKit.PDFDocument, label: string, value: string) {
  d.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(value);
}

/** Donation receipt. Only ever generated for donations whose DB status is PAID. */
export function makeReceipt(data: {
  reference: string; name?: string | null; amount: number; status: string;
  paymentId?: string | null; paidAt?: Date | string | null; phone?: string | null;
}) {
  return render((d) => {
    header(d, 'Donation Receipt');
    row(d, 'Receipt / Reference', data.reference);
    row(d, 'Donor', data.name || 'Donor');
    if (data.phone) row(d, 'Mobile', data.phone.replace(/^(\d{2})\d+(\d{3})$/, '$1xxxxx$2'));
    row(d, 'Amount received', `INR ${data.amount.toLocaleString('en-IN')}`);
    row(d, 'Payment status', data.status);
    if (data.paymentId) row(d, 'Razorpay payment ID', data.paymentId);
    row(d, 'Payment date', fmtDate(data.paidAt));
    d.moveDown(1.5).fontSize(11).text('Thank you for your generous contribution to Amrit Vela Trust. May your seva be blessed.', { align: 'left' });
    d.moveDown(2).fontSize(8).fillColor('#666').text('This is a system-generated receipt. Please contact the Trust for 80G / tax related queries.');
  });
}

export function makeInvoice(data: {
  orderNumber: string; name?: string | null; phone?: string | null;
  items?: { name: string; quantity: number; unitPrice: number }[];
  subtotal: number; shippingFee: number; total: number; paymentStatus: string;
  paymentId?: string | null; paidAt?: Date | string | null; address?: string | null;
}) {
  return render((d) => {
    header(d, 'Order Invoice');
    row(d, 'Order', data.orderNumber);
    row(d, 'Customer', data.name || 'Customer');
    if (data.phone) row(d, 'Mobile', data.phone);
    if (data.address) row(d, 'Delivery address', data.address);
    d.moveDown();
    for (const item of data.items || []) {
      d.text(`${item.name} x ${item.quantity} — INR ${(item.unitPrice * item.quantity).toLocaleString('en-IN')}`);
    }
    d.moveDown();
    d.text(`Subtotal: INR ${data.subtotal.toLocaleString('en-IN')}`);
    d.text(`Delivery: INR ${data.shippingFee.toLocaleString('en-IN')}`);
    d.font('Helvetica-Bold').fontSize(14).text(`Total: INR ${data.total.toLocaleString('en-IN')}`).font('Helvetica').fontSize(10);
    d.moveDown(0.5);
    d.text(`Payment: ${data.paymentStatus}${data.paymentId ? ` (${data.paymentId})` : ''}`);
    d.text(`Paid on: ${fmtDate(data.paidAt)}`);
  });
}
