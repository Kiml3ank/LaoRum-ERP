from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, PageBreak, KeepTogether)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

F = "C:/Windows/Fonts/"
pdfmetrics.registerFont(TTFont("A", F + "arial.ttf"))
pdfmetrics.registerFont(TTFont("A-B", F + "arialbd.ttf"))
pdfmetrics.registerFont(TTFont("A-I", F + "ariali.ttf"))
pdfmetrics.registerFontFamily("A", normal="A", bold="A-B", italic="A-I", boldItalic="A-B")

INK = colors.HexColor("#1f2933"); ACC = colors.HexColor("#b4472a")
MUTE = colors.HexColor("#6b7280"); SOFT = colors.HexColor("#f6efe9"); LINE = colors.HexColor("#e2d6cc")

body = ParagraphStyle("b", fontName="A", fontSize=10, leading=14.5, textColor=INK, spaceAfter=4)
small = ParagraphStyle("s", parent=body, fontSize=8.8, leading=12.5)
h1 = ParagraphStyle("h1", fontName="A-B", fontSize=17, leading=21, textColor=ACC, spaceBefore=6, spaceAfter=8)
h2 = ParagraphStyle("h2", fontName="A-B", fontSize=11.5, leading=15, textColor=INK, spaceBefore=8, spaceAfter=3)
bul = ParagraphStyle("bu", parent=body, bulletFontName="A", leftIndent=12, bulletIndent=2, spaceAfter=2)
title = ParagraphStyle("t", fontName="A-B", fontSize=30, leading=35, textColor=INK)
sub = ParagraphStyle("st", fontName="A", fontSize=13, leading=18, textColor=MUTE)
cell = ParagraphStyle("c", parent=body, fontSize=9, leading=12.5, spaceAfter=0)
cellb = ParagraphStyle("cb", parent=cell, fontName="A-B")
flow = ParagraphStyle("f", parent=body, fontName="A-B", fontSize=10.5, leading=15, textColor=ACC)

def P(t, s=body): return Paragraph(t, s)
def B(items): return [Paragraph(i, bul, bulletText="•") for i in items]
def H1(t): return [P(t, h1)]
def H2(t): return P(t, h2)

def table(rows, widths, header=True):
    data = [[Paragraph(c, cellb if (header and r == 0) else cell) for c in row] for r, row in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    st = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
          ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]
    if header: st.append(("BACKGROUND", (0, 0), (-1, 0), SOFT))
    t.setStyle(TableStyle(st)); return t

def callout(text):
    t = Table([[Paragraph(text, cell)]], colWidths=[170 * mm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SOFT), ("LINEBEFORE", (0, 0), (0, -1), 3, ACC),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 7),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
    return t

def footer(c, d):
    c.saveState(); c.setFont("A", 8); c.setFillColor(MUTE)
    c.drawString(20 * mm, 11 * mm, "Restaurant ERP: single-location evaluation brief")
    c.drawRightString(190 * mm, 11 * mm, f"{d.page}")
    c.setStrokeColor(LINE); c.line(20 * mm, 15 * mm, 190 * mm, 15 * mm); c.restoreState()

doc = BaseDocTemplate("Restaurant_ERP_Overview.pdf", pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                      topMargin=18 * mm, bottomMargin=22 * mm, title="Restaurant ERP: Single-Location Evaluation Brief",
                      author="")
fr = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
doc.addPageTemplates([PageTemplate(id="p", frames=[fr], onPage=footer)])
W = 170 * mm
s = []

# Cover
s += [Spacer(1, 55 * mm), P("Restaurant ERP", title), P("How it works in a single-location restaurant, and how to evaluate it", sub),
      Spacer(1, 10 * mm), callout("<b>Purpose.</b> A shared understanding of how sales, kitchen, recipes, inventory, purchasing, "
      "finance and reporting connect, and a practical way to assess ERP software for one restaurant. "
      "This is a business and operations view, not a software build plan."), Spacer(1, 8 * mm),
      P("Figures in this document are illustrative samples, not actual restaurant data.", small), PageBreak()]

# 1
s += H1("1. What a restaurant ERP is")
s += [P("An integrated system that connects sales, kitchen operations, recipes, inventory, purchasing, finance, staff and "
        "management reporting, so every department works from consistent business records."),
      P("Customer order → POS → Kitchen/KDS → Recipe-based consumption → Inventory → Accounting → Management reports", flow),
      P("These are related but distinct records. An order can reach the kitchen before it is paid, and cancellations, "
        "refunds, wastage and staff meals each need separate handling.")]
s.append(H2("Example team (single location)"))
s.append(table([["Role", "Headcount", "Responsibility"],
    ["Manager", "1", "Oversees the business"], ["Cashiers", "2", "Payments, shift close"],
    ["Waiters", "3", "Tables and orders (front of house)"], ["Kitchen staff", "3", "Food preparation (back of house)"],
    ["Purchasing / inventory", "1", "Buys ingredients, tracks stock"], ["Accountant", "1 (may be shared)", "Costs, liabilities, performance"]],
    [50 * mm, 35 * mm, 85 * mm]))

s += [Spacer(1, 4 * mm)] + H1("2. Daily operating workflow")
s.append(table([["Opening", "Service", "Closing"], [
    "<br/>".join(["• Staff clock in", "• Manager checks equipment", "• Check cash float", "• Review stock and menu availability", "• Review pending purchase orders"]),
    "<br/>".join(["• Assign table or takeaway/delivery", "• Enter order in POS", "• KDS sends order to kitchen", "• Kitchen prepares, marks ready", "• Serve", "• Record payment (cash, card, QR)", "• Calculate consumption from recipes"]),
    "<br/>".join(["• Close cashier shifts", "• Reconcile cash, card, QR", "• Review discounts, voids, refunds", "• Record wastage and adjustments", "• Check inventory discrepancies", "• Generate daily reports"])]],
    [W / 3] * 3))
s.append(PageBreak())

# 3 modules
s += H1("3. The seven key modules")
s.append(H2("A. POS and sales management"))
s += B(["Dine-in, takeaway, delivery; table management; discounts and promotions; payments; receipts; voids, cancellations, refunds.",
        "Key record: order ID, date/time, cashier/waiter, table, items, quantities, prices, discounts, payment method, status.",
        "<b>Value:</b> accurate sales records and accountability."])
s.append(H2("B. Menu and recipe management"))
s.append(P("A menu item needs a recipe, not just a name and a price. Example: Chicken Fried Rice."))
s.append(table([["Ingredient", "Quantity", "Cost (LAK)"], ["Rice", "200 g", "2,000"], ["Chicken", "150 g", "8,000"], ["Egg", "1", "2,000"],
                ["Oil", "20 ml", "1,000"], ["Seasoning", "10 g", "1,000"], ["<b>Total</b>", "", "<b>14,000</b>"]], [70 * mm, 50 * mm, 50 * mm]))
s += [Spacer(1, 2 * mm), P("Selling price 50,000 LAK → food cost % = 14,000 ÷ 50,000 × 100 = <b>28%</b>. "
      "The remaining 36,000 LAK is <b>not</b> net profit; rent, salaries and utilities still come out of it."),
      P("Capabilities: recipe costing, menu profitability, ingredient consumption, recipe version history, price analysis.")]
s.append(H2("C. Inventory management"))
s.append(table([["Example: chicken", "kg"], ["Opening stock", "20"], ["Goods received", "+10"], ["Used for sales", "-8"], ["Recorded wastage", "-1"],
                ["<b>Expected closing</b>", "<b>21</b>"]], [70 * mm, 30 * mm]))
s += [Spacer(1, 2 * mm), P("<b>Theoretical stock</b> is what the system calculates; <b>actual stock</b> is what is physically counted. "
      "If the system says 21 kg and the count is 18 kg, the ERP should show a 3 kg variance and require investigation and approval."),
      P("Capabilities: stock in/out, transfers between storage areas, adjustments, waste/spoilage, physical counts, expiry tracking, minimum-stock alerts.")]
s.append(H2("D. Purchasing and supplier management"))
s.append(P("Low stock flagged → purchase request → manager approves quantity and budget → PO issued → goods received and checked → "
           "supplier invoice recorded → inventory updated.", flow))
s.append(P("Capabilities: supplier contacts, requests and POs, receiving records, invoice and payment status, supplier price history."))
s.append(H2("E. Kitchen management / KDS"))
s += B(["Statuses: New, Accepted, Preparing, Ready, Served, Cancelled.",
        "Monitor: delayed orders, average preparation time, slowest dishes, orders waiting in queue."])
s.append(H2("F. Accounting and finance"))
s += B(["Tracks revenue, COGS, operating expenses, payroll, accounts payable, cash and bank balances, profit and loss.",
        "Sales revenue is not cash collected, and cash collected is not profit."])
s.append(H2("G. Management dashboard and reporting"))
s += B(["KPIs: total sales, orders, average order value, food cost %, gross profit, inventory variance, waste %, labour cost %.",
        "Reports filterable by date, menu item, cashier, payment method and similar dimensions."])

# 4
s += H1("4. How modules work together")
s.append(P("One Chicken Fried Rice is sold:"))
s.append(table([["Step", "What happens"], ["POS", "Records the sale"], ["KDS", "Receives the preparation ticket"],
    ["Recipe", "Defines ingredient quantities"], ["Inventory", "Records ingredient consumption"],
    ["Accounting", "Records revenue and applicable costs"], ["Reporting", "Updates sales and profitability"]], [40 * mm, 130 * mm]))
s.append(H2("Exception handling is essential"))
s.append(table([["Situation", "Correct treatment"],
    ["Cancelled before preparation", "Generally no ingredient consumption"], ["Cancelled after cooking", "May create wastage"],
    ["Refund", "Adjust financial records correctly"], ["Staff meal", "Record as staff consumption, not a normal sale"],
    ["Stock adjustment", "Require a reason and authorization"]], [60 * mm, 110 * mm]))

s += [Spacer(1, 4 * mm)] + H1("5. ERP vs POS")
s.append(table([["POS", "ERP"], ["Transactions: orders, payments, receipts, basic sales reports, maybe basic stock deduction.",
    "Whole business: sales, recipes, inventory, purchasing, accounting, staff, integrated reporting."]], [W / 2] * 2))
s += [Spacer(1, 2 * mm), P("A POS can be one component of an ERP. For one restaurant, a well-integrated restaurant management platform may be enough; "
      "an enterprise-grade ERP may be unnecessary.")]

s += [Spacer(1, 2 * mm)] + H1("6. Evaluation priorities")
s.append(table([["Essential", "Important", "Optional"],
    ["POS<br/>Menu and recipes<br/>Inventory<br/>Purchasing<br/>Sales and operational reports",
     "Accounting / expenses<br/>Employee management<br/>KDS<br/>Supplier management",
     "Loyalty / CRM<br/>Advanced forecasting<br/>AI analytics"]], [W / 3] * 3))

s.append(H2("Ten questions to ask an ERP vendor"))
qs = ["Can the system operate offline, and how does synchronization work?", "Does POS synchronize with inventory automatically?",
      "Can we configure recipes and ingredient quantities?", "Can we track wastage and expired ingredients?",
      "Can managers approve purchase orders?", "Can we see daily profit and loss?",
      "Can cash, bank, card and QR payments be reconciled separately?", "Can employee access be restricted by role?",
      "Can reports be exported to Excel or PDF?", "What backup, recovery, support and data-export options are provided?"]
s.append(table([[str(i + 1), q] for i, q in enumerate(qs)], [10 * mm, 160 * mm], header=False))
s += [Spacer(1, 3 * mm), callout("<b>Test the full workflow with realistic scenarios</b>, not only the vendor's dashboard demo.")]

s += [Spacer(1, 4 * mm)] + H1("7. Implementation phases")
s.append(table([["Phase", "Focus", "Goal"], ["1", "POS and menu", "Control sales"], ["2", "Recipes and inventory", "Control ingredient usage"],
    ["3", "Purchasing and suppliers", "Control procurement"], ["4", "Accounting and expenses", "Understand finances"],
    ["5", "KDS and staff management", "Improve operations"], ["6", "Analytics and reporting", "Improve decisions"]], [20 * mm, 80 * mm, 70 * mm]))
s.append(H2("Prepare before launch"))
s += B(["Complete menu and price list; ingredient master list and units of measure; standard recipes.",
        "Supplier records; opening physical inventory count; employee accounts and permissions.",
        "Payment methods; opening cash balance."])
s.append(P("Accurate opening stock and recipe data are prerequisites for reliable food-cost reporting."))

s += [Spacer(1, 2 * mm)] + H1("8. Manager's daily checklist")
s.append(table([["Morning", "During service", "Closing"], [
    "• Review opening inventory<br/>• Check attendance<br/>• Check cash float<br/>• Review pending POs<br/>• Confirm menu availability",
    "• Monitor sales<br/>• Check kitchen delays<br/>• Monitor low stock<br/>• Review discounts and voids<br/>• Handle complaints",
    "• Close cashier shifts<br/>• Reconcile cash/card/QR<br/>• Review sales and expenses<br/>• Record wastage<br/>• Check stock discrepancies<br/>• Generate daily reports"]],
    [W / 3] * 3))

s += H1("9. Example dashboard (illustrative)")
s.append(table([["Daily sales", "Orders", "Food cost", "Avg. order value"], ["8,500,000 LAK", "142", "32%", "≈ 59,900 LAK"]], [W / 4] * 4))
s += [Spacer(1, 3 * mm), table([["Daypart", "Sales (LAK)"], ["Breakfast", "1,500,000"], ["Lunch", "4,200,000"], ["Dinner", "2,800,000"]], [80 * mm, 60 * mm]),
      Spacer(1, 3 * mm), P("Stock alerts: <b>Chicken</b> critical low · <b>Cooking oil</b> warning · <b>Rice</b> normal.")]

s += [Spacer(1, 3 * mm)] + H1("10. Scenario for discussion")
s.append(P("A customer orders 2 Chicken Fried Rice and 1 Iced Coffee, and pays 120,000 LAK by QR. The kitchen prepares it, "
           "but an employee accidentally wastes one serving of chicken."))
s.append(table([["Question", "Answer"], ["Which module first records the order?", "POS"],
    ["Which calculates chicken consumption?", "Recipe and inventory"],
    ["How is the wasted chicken recorded?", "Inventory wastage, separate from normal consumption"],
    ["Where does management review results?", "Management reports and accounting"]], [90 * mm, 80 * mm]))

s += [Spacer(1, 4 * mm)] + H1("11. Recommended next step")
s.append(P("Move from general understanding to a <b>Business Requirements Document (BRD)</b> and <b>Functional Requirements Specification (FRS)</b>. First clarify:"))
s += B(["Restaurant type (casual dining, café, fast food, fine dining, hotel)", "Dine-in, takeaway, delivery and table-service needs",
        "Number of tables, menu items, employees, daily orders", "Current processes and pain points",
        "Inventory complexity and recipe detail", "Payment methods, especially local QR",
        "Accounting requirements and local tax/reporting needs", "Internet reliability and offline POS needs",
        "Budget, timeline, training, support and data ownership"])
s.append(H2("Deliverables to produce"))
s += B(["Business process map", "Stakeholder and user-role list", "BRD with goals and requirements", "Functional requirements checklist",
        "Vendor evaluation scorecard", "Demo/test scenarios and acceptance criteria", "Implementation plan and risk register"])
s += [Spacer(1, 3 * mm), callout("<b>Do not assume every restaurant needs every module.</b> Prioritize reliable sales, stock, purchasing and "
      "financial visibility first, then add complexity when the business actually needs it.")]

doc.build(s)
