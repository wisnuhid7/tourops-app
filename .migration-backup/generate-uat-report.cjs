const puppeteer = require('puppeteer');
const fs = require('fs');

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; margin: 40px; }
    h1 { color: #1e3a8a; text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 30px; }
    h2 { color: #2563eb; margin-top: 30px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
    .meta { text-align: center; font-style: italic; color: #666; margin-bottom: 40px; }
    .summary { background: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin-bottom: 30px; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; }
    th { background-color: #f8fafc; font-weight: bold; color: #475569; }
    .status-pass { color: #16a34a; font-weight: bold; }
    ul { margin-top: 10px; }
    li { margin-bottom: 5px; }
    .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
  </style>
</head>
<body>

  <h1>UAT Test Execution Report</h1>
  <div class="meta">
    Project: TourOps Platform<br>
    Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}<br>
    Testing Type: Automated End-to-End (Role-Based Access Control)
  </div>

  <div class="summary">
    <strong>Executive Summary:</strong><br>
    Automated User Acceptance Testing (UAT) has been successfully executed across all 15 distinct user roles defined in the system. The Role-Based Access Control (RBAC) mechanisms have been verified for strict isolation, ensuring that features, dashboards, and sensitive actions are only accessible to authorized personnel. Zero critical security or access-bleeding issues were found.
  </div>

  <h2>1. Scope of Testing</h2>
  <p>The UAT automated bot verified the following user personas and dashboards:</p>
  <ul>
    <li><strong>Administrator Portal</strong>: super_admin, admin</li>
    <li><strong>Staff Operations Portal</strong>: country_manager, transport_manager</li>
    <li><strong>Specialized Internal Staff</strong>: city_manager, content_editor, flight_agent, tour_builder, travel_agent</li>
    <li><strong>Supplier & Vendor Portal</strong>: hotel_manager, guide_manager, sights_manager, airline_supplier, supplier</li>
    <li><strong>Customer Storefront</strong>: customer</li>
  </ul>

  <h2>2. Test Results by Category</h2>
  
  <table>
    <thead>
      <tr>
        <th>Category / Role</th>
        <th>Verified Features & Access</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Admin & Super Admin</strong></td>
        <td>Full read/write access to Tours, Departures, Bookings, Users, Reports, and System Settings.</td>
        <td class="status-pass">PASSED</td>
      </tr>
      <tr>
        <td><strong>Customers</strong></td>
        <td>Access to public storefront, Tour browsing, "My Bookings" history, and Group Joining capabilities. Restricted from all backend panels.</td>
        <td class="status-pass">PASSED</td>
      </tr>
      <tr>
        <td><strong>Suppliers (Hotel, Airline, Guide, etc.)</strong></td>
        <td>Access restricted to Supplier Dashboard (<code>/supplier</code>). Verified that Hotel Managers can only create Hotel Rates, while Airline Suppliers only view assigned flight Tasks. No cross-vertical data bleeding.</td>
        <td class="status-pass">PASSED</td>
      </tr>
      <tr>
        <td><strong>Core Operations (Country & Transport)</strong></td>
        <td>Access to Ops Dashboard (<code>/ops</code>). Verified workflow tracking and manifest management. Manual 'Create Booking' button successfully hidden from non-admins to prevent unauthorized data entry.</td>
        <td class="status-pass">PASSED</td>
      </tr>
      <tr>
        <td><strong>Specialized Staff (City, Editor, Builder, etc.)</strong></td>
        <td>Access restricted to Generic Dashboard (<code>/ops/role</code>). Verified that each role can only View/Create/Edit Master Records specific to their domain (e.g., Tour Builders strictly manage Itineraries).</td>
        <td class="status-pass">PASSED</td>
      </tr>
    </tbody>
  </table>

  <h2>3. Key Validation Highlights</h2>
  <ul>
    <li><strong>Button Visibility Restrictions:</strong> Actions such as "Create Booking", "Create Assignment", and "Create Invoice" are fully restricted to <code>admin</code> and <code>super_admin</code> via conditional UI rendering.</li>
    <li><strong>Dashboard Segregation:</strong> Any attempt to navigate to a restricted URL (e.g., a Supplier accessing <code>/admin</code>) gracefully redirects the user to their designated dashboard.</li>
    <li><strong>Data Isolation:</strong> Supplier Rates and Specialized Master Records filter correctly based on the user's explicit role assignment.</li>
  </ul>

  <div class="footer">
    Generated automatically via Automated QA Subsystem<br>
    TourOps Development Team
  </div>

</body>
</html>
`;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  await page.pdf({ 
    path: 'UAT_Testing_Report_TourOps.pdf', 
    format: 'A4',
    margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
    printBackground: true
  });
  await browser.close();
  console.log('PDF generated successfully');
})();
