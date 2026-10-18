# Title
QuickBite — Restaurant Ordering and Management System

# Description
QuickBite is a full-stack restaurant ordering and management application developed as a group project for Moringa School Phase 2. It enables customers to browse meals, place orders, and choose a payment method, while restaurant staff manage orders, food availability, and restaurant performance.

## Live Application

- **Frontend:** https://frontend-three-phi-81.vercel.app/menu
- **GitHub Repository:** https://github.com/robert00-1/Quickbite
- **Backend:** Flask REST API connected to PostgreSQL.

## Features

### Customer Features
- Browse restaurant meals, food descriptions, prices, and images.
- View food details and select quantities.
- Add meals to the shopping cart.
- Enter customer and table details during checkout.
- Choose cash or M-Pesa as a payment method.
- Submit orders and view order confirmation.

### Waiter Dashboard
- View restaurant orders.
- Monitor order status.
- Update orders as they move through the preparation process.
- Manage the workflow from pending to preparing, ready, and served.

### Manager Dashboard
- Monitor total orders, monthly orders, revenue, and popular meals.
- Add food items to the menu.
- Upload and update food images using Cloudinary.
- Mark meals as available or unavailable.
- Add and manage waiter profiles.
- Remove waiters from the active roster.
- Monitor order activity and restaurant performance.

### M-Pesa Payments
- Integrate with Safaricom Daraja for M-Pesa STK Push payments.
- Send payment requests for eligible orders.
- Receive payment callback notifications.
- Update payment information based on callback results.

**Note:** M-Pesa sandbox testing and production payment processing are different. Production transactions require the appropriate Safaricom credentials and configuration.

## Technologies Used

| Technology | Purpose |
|---|---|
| React and JavaScript | Frontend user interface |
| Vite | Frontend development and build tooling |
| Tailwind CSS | Styling and responsive layouts |
| Flask | Backend REST API |
| PostgreSQL | Relational database |
| SQLAlchemy | Database models and queries |
| Flask-Migrate | Database schema migrations |
| Safaricom Daraja API | M-Pesa payment integration |
| Cloudinary | Food image storage and delivery |
| Vercel | Frontend deployment |
| Render | Backend deployment |

## Project Structure


Quickbite/
├── backend/
│   ├── app/
│   │   ├── models/
│   │   └── routes/
│   ├── requirements.txt
│   ├── run.py
│   └── ...
├── src/
│   ├── components/
│   ├── pages/
│   ├── services/
│   └── App.jsx
├── public/
├── package.json
└── README.md


## Getting Started

### Prerequisites

Install the following before running the application locally:

- Node.js and npm
- Python
- PostgreSQL
- Git
- Pipenv, if using the project's Pipenv environment

### 1. Clone the repository


git clone https://github.com/robert00-1/Quickbite.git
cd Quickbite


### 2. Set up the frontend


npm install
npm run dev


Vite will display the local development URL in the terminal.

To create a production build:


npm run build


### 3. Set up the backend

Open a second terminal from the project root:


cd backend
pipenv install -r requirements.txt


Configure the backend environment variables for the PostgreSQL database, staff authentication, Cloudinary, and Safaricom Daraja credentials. Use the project's existing configuration and environment-variable names.

Create or configure the PostgreSQL database, then apply the project's migrations if required:


pipenv run flask db upgrade


Start the backend using the project's entry point:


pipenv run python run.py


Use the port and host configured in the backend. Ensure the frontend is configured to communicate with the correct backend URL.

**Security:** Never commit `.env` files, database passwords, API secrets, access tokens, or production credentials to GitHub.

## Main API Endpoints

The backend exposes REST API endpoints for menu management, ordering, waiter profiles, and payments.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/menu-items` | Retrieve menu items |
| POST | `/api/menu-items` | Create a menu item |
| GET | `/api/orders` | Retrieve orders, subject to the endpoint's access rules |
| POST | `/api/orders` | Create an order |
| POST | `/api/payments/stk-push` | Initiate an M-Pesa STK Push |
| POST | `/api/payments/callback` | Receive Daraja payment callbacks |
| GET | `/api/waiter-profiles` | Retrieve active waiter profiles |
| POST | `/api/waiter-profiles` | Add a waiter profile |
| PATCH | `/api/waiter-profiles/:waiter_id` | Update waiter profile status |
| DELETE | `/api/waiter-profiles/:waiter_id` | Deactivate a waiter profile |

Staff-only endpoints require the appropriate authentication and role permissions. The exact supported request fields and response formats are defined in the backend route implementations.

## Contributors and Responsibilities

This project was developed collaboratively, with each team member responsible for a major application feature.

| Contributor | Responsibility |
|---|---|
| **Alma** | Menu development and API integration |
| **Irene** | Shopping cart functionality |
| **Robert** | Checkout and payment integration, including M-Pesa |
| **Jacob** | Waiter dashboard and order-status workflow |
| **Martin** | Manager dashboard and restaurant management features |

## Challenges and Learning Outcomes

During development, the team worked on integrating the frontend with a Flask backend, connecting PostgreSQL models and routes, coordinating Git branches, handling order-status updates, integrating M-Pesa callbacks, and uploading food images to Cloudinary.

The project provided practical experience in full-stack development, REST API integration, database management, payment workflows, deployment, collaborative Git workflows, and role-based access control.

## Future Improvements

- Add automated tests for frontend and backend workflows.
- Improve dashboard performance and monitoring.
- Expand inventory tracking and low-stock alerts.
- Strengthen payment reconciliation and transaction reporting.
- Improve accessibility and responsive design.
- Add more comprehensive deployment and API documentation.

## License

This project was developed for educational purposes as part of the Moringa School software engineering program.
