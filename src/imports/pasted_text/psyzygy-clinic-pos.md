Create a clean, professional, responsive POS web application for a psychological clinic using React, Tailwind CSS, and Supabase-ready structure. The design must be easy to edit later in Visual Studio Code, so use reusable components, clear naming, simple layout structure, and avoid overly complex animations or fragile absolute positioning.

App name: Psyzygy Clinic POS

Design style:
- Elegant, calm, professional, clinic-friendly
- Use soft neutral background, white cards, rounded corners, subtle shadows
- Accent colors: teal, muted blue, soft green, and warm beige
- Must look trustworthy, organized, and easy to use for clinic staff
- Fully responsive for desktop, tablet, and mobile
- Avoid design breaking when edited in VS Code
- Use Tailwind utility classes only
- Use reusable components such as Sidebar, Header, Card, Button, Modal, Table, Badge, FormInput, SelectInput, PaymentMethodCard

Main user roles:
1. Admin
2. Cashier / Front Desk
3. Clinician view-only access for selected transactions if needed

Core pages and modules:

1. Login Page
- Email and password login
- Clinic logo placeholder
- “Forgot password” link
- Clean centered card design

2. Dashboard
Show summary cards:
- Today’s total sales
- Total paid
- Total unpaid balance
- Partial payments today
- Number of transactions
- Pending balances
- Most availed services
Include simple chart placeholders for:
- Sales by service type
- Payment method breakdown

3. POS / New Transaction Page
This is the main page.
Layout:
Left side:
- Search/select client
- Add new client button
- Select service category
- Select service
- Quantity
- Professional fee / service amount
- Discount field
- Notes field

Right side:
- Transaction summary card
- Subtotal
- Discount
- Total amount
- Amount paid
- Remaining balance
- Payment status: Paid, Partial, Unpaid
- Button: Save Transaction
- Button: Save & Print Receipt

Services should include examples:
- Individual Consultation – In Person
- Individual Consultation – Online
- Psychotherapy / Supportive Counseling
- Trauma Therapy
- Psychological Assessment – Basic
- Psychological Assessment – Comprehensive
- Certification / Report Fee
- Mental Health Seminar
- Group Counseling / Debriefing
- Other Service

4. Client Management Page
- Client list table
- Search by name, contact number, email
- Add client modal
Fields:
- Client ID
- Full name
- Date of birth
- Age
- Sex
- Contact number
- Email
- Address
- Emergency contact
- Notes
- Consent status
- Privacy notice acknowledgment

5. Payment Module
Very important: The system must support:
- Full payment
- Partial payment
- Split payment using different methods

Payment methods:
- Cash
- GCash
- Maya
- Bank Transfer
- Credit Card
- Debit Card
- HMO / Company Sponsored
- Check
- Other

For split payment, allow staff to add multiple payment rows:
Example:
Total amount: ₱2,000
Payment 1: Cash – ₱1,000
Payment 2: GCash – ₱500
Remaining balance: ₱500
Status: Partial

Payment fields:
- Payment method
- Amount
- Reference number
- Payment date
- Received by
- Notes

Show automatic calculation:
- Total amount due
- Total amount paid
- Remaining balance
- Change amount, if overpaid
- Payment status

6. Transactions Page
- Table of all transactions
Columns:
- Transaction number
- Date
- Client name
- Service
- Total amount
- Amount paid
- Balance
- Payment status
- Payment method/s
- Staff
- Actions: View, Edit, Add Payment, Print Receipt

Filters:
- Date range
- Payment status
- Payment method
- Service category
- Staff

7. Add Payment to Existing Balance
Create a modal/page where staff can add another payment to a partially paid transaction.
Show:
- Original total amount
- Previous payments
- Remaining balance
- New payment amount
- Payment method
- Reference number
- Save payment button

8. Receipt Page / Printable Receipt
Create a clean receipt design.
Include:
- Clinic name
- Clinic address placeholder
- Contact details placeholder
- Official receipt / acknowledgment receipt label
- Transaction number
- Date and time
- Client name
- Services availed
- Total amount
- Amount paid
- Balance
- Payment method/s
- Reference number/s
- Received by
- Footer note:
  “This receipt acknowledges payment received for psychological services rendered. This is not a psychological report or clinical certification.”

Buttons:
- Print
- Download PDF placeholder
- Back to transaction

9. Services and Pricing Page
Admin can manage services:
- Add service
- Edit service
- Archive service
Fields:
- Service name
- Category
- Description
- Default price
- Duration
- Active/inactive status

10. Reports Page
Include:
- Daily sales report
- Monthly sales report
- Outstanding balances
- Payments by method
- Sales by service
- Client transaction history
- Export to Excel button placeholder
- Print report button placeholder

11. Settings Page
Include:
- Clinic profile
- Receipt settings
- Payment methods
- User management
- Tax/VAT setting placeholder
- Discount types
- Data privacy notice

Suggested Supabase database schema:
Create code comments or placeholder data structures for these tables:

clients:
- id
- client_code
- full_name
- birthdate
- age
- sex
- contact_number
- email
- address
- emergency_contact
- notes
- consent_status
- privacy_acknowledged
- created_at
- updated_at

services:
- id
- name
- category
- description
- default_price
- duration_minutes
- is_active
- created_at
- updated_at

transactions:
- id
- transaction_number
- client_id
- transaction_date
- subtotal
- discount_amount
- total_amount
- total_paid
- balance
- payment_status
- notes
- created_by
- created_at
- updated_at

transaction_items:
- id
- transaction_id
- service_id
- service_name
- quantity
- unit_price
- discount_amount
- line_total

payments:
- id
- transaction_id
- payment_method
- amount
- reference_number
- payment_date
- received_by
- notes
- created_at

users:
- id
- full_name
- email
- role
- is_active
- created_at

Important logic:
- A transaction can have many services.
- A transaction can have many payments.
- Payment status should update automatically:
  If total_paid = 0, status = Unpaid
  If total_paid is less than total_amount, status = Partial
  If total_paid is equal to total_amount, status = Paid
  If total_paid is greater than total_amount, show Change/Overpayment
- Allow partial payment.
- Allow multiple payment methods in one transaction.
- Do not delete paid transactions; use void/cancel status if needed.
- Make all money values formatted in Philippine Peso: ₱

Technical requirements:
- Use React functional components
- Use Tailwind CSS
- Use lucide-react icons
- Make components modular and easy to transfer to VS Code
- Use sample static data first, but structure the app so it can easily connect to Supabase later
- Use clear file/component naming
- Avoid hardcoded layout sizes that break responsiveness
- Use responsive grid and flex layouts
- Use accessible buttons, labels, and form inputs
- Use modals for add/edit forms
- Use tables that are responsive and scrollable on small screens
- Keep the code clean, readable, and production-ready

Suggested component structure:
- App.jsx
- components/Sidebar.jsx
- components/Header.jsx
- components/StatCard.jsx
- components/Button.jsx
- components/Input.jsx
- components/Select.jsx
- components/Modal.jsx
- components/TransactionTable.jsx
- components/PaymentRows.jsx
- components/ReceiptPreview.jsx
- pages/Dashboard.jsx
- pages/POS.jsx
- pages/Clients.jsx
- pages/Transactions.jsx
- pages/Services.jsx
- pages/Reports.jsx
- pages/Settings.jsx
- lib/supabaseClient.js

Create a working front-end prototype with sample data and interactive UI behavior:
- Add service to cart
- Compute totals
- Add multiple payment methods
- Show remaining balance
- Mark transaction as Paid, Partial, or Unpaid
- Open receipt preview
- View transaction list
- Add payment to existing partial transaction

Make the interface suitable for a psychological clinic, not a retail store. Use professional terms such as client, service, consultation, assessment, payment record, balance, and receipt.