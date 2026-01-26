# HairDAO Email Templates

Production-ready email templates for the HairDAO marketing platform.

## Features

- 📱 **Mobile-responsive** (600px max width)
- 🌙 **Dark mode support** with `@media (prefers-color-scheme)`
- 🎨 **HairDAO brand colors** (emerald/green accents, dark theme)
- 📧 **Proper email HTML** (table-based layouts, inline styles)
- 🔤 **Handlebars/Mustache variables** for personalization
- 📄 **Plain text versions** included for all templates

## Template Categories

### Welcome Series (`/welcome`)
| Template | Purpose | Send Time |
|----------|---------|-----------|
| `welcome-1.html` | Welcome + what to expect | Immediate |
| `welcome-2.html` | Getting started guide | Day 2 |
| `welcome-3.html` | Community invite + resources | Day 5 |

### Transactional (`/transactional`)
| Template | Purpose |
|----------|---------|
| `order-confirmation.html` | Purchase receipt |
| `shipping-notification.html` | Order shipped notification |
| `delivery-confirmation.html` | Order delivered + review request |

### Abandoned Cart (`/abandoned-cart`)
| Template | Purpose | Send Time |
|----------|---------|-----------|
| `cart-reminder-1.html` | Gentle reminder | 1 hour after abandonment |
| `cart-reminder-2.html` | Urgency + incentive | 24 hours after abandonment |

### Re-engagement (`/re-engagement`)
| Template | Purpose |
|----------|---------|
| `we-miss-you.html` | Win-back email |
| `special-offer.html` | Exclusive discount |

## Template Variables

### Common Variables (all templates)
```handlebars
{{firstName}}        - Customer's first name
{{preferencesUrl}}   - Email preferences URL
{{unsubscribeUrl}}   - Unsubscribe URL
```

### Welcome Series
```handlebars
{{dashboardUrl}}     - User dashboard URL
{{profileUrl}}       - Profile completion URL
{{discordInviteUrl}} - Discord community invite
{{beginnerGuideUrl}} - Beginner's guide URL
{{researchHubUrl}}   - Research hub URL
{{faqUrl}}           - FAQ URL
{{blogUrl}}          - Blog URL
```

### Transactional
```handlebars
{{orderNumber}}      - Order number
{{orderItems}}       - Array: [{name, imageUrl, quantity, price}]
{{subtotal}}         - Order subtotal
{{shippingCost}}     - Shipping cost
{{discount}}         - Discount amount (optional)
{{total}}            - Order total
{{shippingName}}     - Shipping recipient name
{{shippingAddress}}  - Object: {line1, line2, city, state, zip, country}
{{paymentMethod}}    - Payment method name
{{paymentLast4}}     - Last 4 digits of card (optional)
{{orderStatusUrl}}   - Order status URL
{{trackingNumber}}   - Shipping tracking number
{{carrier}}          - Shipping carrier name
{{trackingUrl}}      - Package tracking URL
{{estimatedDelivery}}- Estimated delivery date
{{deliveryDate}}     - Actual delivery date
{{reviewUrl}}        - Product review URL
{{supportUrl}}       - Support URL
```

### Abandoned Cart
```handlebars
{{cartItems}}        - Array: [{name, imageUrl, quantity, price}]
{{cartTotal}}        - Cart total
{{cartUrl}}          - Cart URL
{{discountCode}}     - Discount code (cart-reminder-2)
{{discountPercent}}  - Discount percentage (cart-reminder-2)
{{discountedTotal}}  - Total after discount (cart-reminder-2)
```

### Re-engagement
```handlebars
{{shopUrl}}          - Shop URL
{{discountCode}}     - Discount code
{{discountPercent}}  - Discount percentage
{{expiryDate}}       - Offer expiry date
{{minimumOrder}}     - Minimum order for discount
{{featuredProducts}} - Array: [{name, imageUrl, price}]
```

## Brand Colors

```css
/* Primary */
--emerald-600: #047857;  /* Dark emerald */
--emerald-500: #10b981;  /* Primary emerald */

/* Backgrounds (Dark theme) */
--bg-dark: #0a0a0a;      /* Wrapper background */
--bg-card: #111111;      /* Card background */
--bg-surface: #1a1a1a;   /* Surface background */

/* Borders */
--border: #262626;       /* Border color */

/* Text */
--text-primary: #e5e5e5; /* Primary text */
--text-muted: #a3a3a3;   /* Muted text */
--text-subtle: #737373;  /* Subtle text */
--text-faint: #525252;   /* Faint text */
```

## Usage Example

```javascript
const Handlebars = require('handlebars');
const fs = require('fs');

// Load template
const template = fs.readFileSync('./welcome/welcome-1.html', 'utf8');
const compiled = Handlebars.compile(template);

// Render with data
const html = compiled({
  firstName: 'Alex',
  dashboardUrl: 'https://hairdao.com/dashboard',
  preferencesUrl: 'https://hairdao.com/preferences',
  unsubscribeUrl: 'https://hairdao.com/unsubscribe'
});
```

## Testing

1. Use email testing tools like Litmus or Email on Acid
2. Test in major email clients (Gmail, Outlook, Apple Mail)
3. Verify dark mode rendering
4. Check mobile responsiveness
5. Validate plain text versions

## License

Proprietary - HairDAO
