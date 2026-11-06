// CRM-30 (CRM-F-034): draws a quote as a one-page A4 PDF with pdfkit.
// pdfkit's built-in Helvetica has no ₹ sign, so amounts are written as "Rs. 1,08,000.00".
import PDFDocument from 'pdfkit';
import type { QuoteTotals } from './quotes.totals';

export interface QuotePdfData extends QuoteTotals {
  number: string;
  date: Date;
  validUntil: Date;
  dealTitle: string;
  preparedBy: { name: string; email: string };
  customer: {
    name: string;
    email: string;
    phone: string | null;
    city: string | null;
    company: string | null;
  };
}

export const rupees = (n: number) =>
  `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const day = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// Column x positions on an A4 page (595 points wide, 50 point margins).
const COL = { no: 50, desc: 75, qty: 330, price: 380, amount: 465, right: 545 };

export function renderQuotePdf(q: QuotePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: { Title: `Quote ${q.number}`, Subject: q.dealTitle },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Heading, and the quote number and dates on the right.
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#0f172a').text('QUOTATION', 50, 50);
    doc.font('Helvetica').fontSize(10).fillColor('#334155');
    doc.text(`Quote no: ${q.number}`, 350, 52, { width: 195, align: 'right' });
    doc.text(`Date: ${day(q.date)}`, 350, 66, { width: 195, align: 'right' });
    doc.text(`Valid until: ${day(q.validUntil)}`, 350, 80, { width: 195, align: 'right' });

    // From / To.
    const top = 120;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('From', 50, top);
    doc.font('Helvetica').fillColor('#334155');
    doc.text('CRM-RACRL Sales', 50, top + 14);
    doc.text(q.preparedBy.name);
    doc.text(q.preparedBy.email);

    doc.font('Helvetica-Bold').fillColor('#0f172a').text('To', 300, top);
    doc.font('Helvetica').fillColor('#334155');
    doc.text(q.customer.name, 300, top + 14);
    for (const line of [q.customer.company, q.customer.email, q.customer.phone, q.customer.city]) {
      if (line) doc.text(line);
    }

    doc.font('Helvetica-Bold').fillColor('#0f172a').text(`For: ${q.dealTitle}`, 50, 215);

    // Line items.
    let y = 245;
    const header = () => {
      doc.rect(50, y - 6, 495, 22).fill('#f1f5f9');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a');
      doc.text('#', COL.no, y);
      doc.text('Description', COL.desc, y);
      doc.text('Qty', COL.qty, y, { width: 40, align: 'right' });
      doc.text('Unit price', COL.price, y, { width: 80, align: 'right' });
      doc.text('Amount', COL.amount, y, { width: 80, align: 'right' });
      y += 24;
    };
    header();
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    q.lines.forEach((line, i) => {
      const h = Math.max(doc.heightOfString(line.description, { width: 245 }), 12) + 8;
      if (y + h > 700) {
        doc.addPage();
        y = 60;
        header();
        doc.font('Helvetica').fontSize(9).fillColor('#334155');
      }
      doc.text(String(i + 1), COL.no, y);
      doc.text(line.description, COL.desc, y, { width: 245 });
      doc.text(String(line.quantity), COL.qty, y, { width: 40, align: 'right' });
      doc.text(rupees(line.unitPrice), COL.price, y, { width: 80, align: 'right' });
      doc.text(rupees(line.amount), COL.amount, y, { width: 80, align: 'right' });
      y += h;
      doc
        .moveTo(50, y - 4)
        .lineTo(COL.right, y - 4)
        .strokeColor('#e2e8f0')
        .stroke();
    });

    // Totals.
    y += 10;
    const totalRow = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10);
      doc.fillColor('#0f172a').text(label, 330, y, { width: 125, align: 'right' });
      doc.text(value, COL.amount - 20, y, { width: 100, align: 'right' });
      y += bold ? 20 : 16;
    };
    totalRow('Subtotal', rupees(q.subtotal));
    if (q.discountPct > 0) totalRow(`Discount (${q.discountPct}%)`, `- ${rupees(q.discount)}`);
    doc
      .moveTo(330, y - 2)
      .lineTo(COL.right, y - 2)
      .strokeColor('#94a3b8')
      .stroke();
    y += 4;
    totalRow('Total', rupees(q.total), true);

    doc.font('Helvetica').fontSize(8).fillColor('#64748b');
    doc.text(
      `Prices are in Indian Rupees. This quote is valid until ${day(q.validUntil)}.`,
      50,
      770,
      { width: 495, align: 'center' },
    );
    doc.end();
  });
}
