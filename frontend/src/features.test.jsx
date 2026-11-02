import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StaffLogin from "./pages/StaffLogin";
import Menu from "./pages/Menu";
import FoodCard from "./components/menu/FoodCard";
import WaiterRoster from "./components/waiter/WaiterRoster";
import ManagerOperations from "./components/ManagerOperations";
import PaymentMethod from "./components/checkout/PaymentMethod";
import { getMeals, imageUrl, FALLBACK_IMAGE } from "./services/api";
import { CartProvider } from "./context/CartContext";

const meals = [
  {id: 1, name: "Burger", category: "Main", price: 500, image: "https://example.test/burger.jpg", is_food_of_day: true, preparation_time: 15, serving_time: 5},
  {id: 2, name: "Kids Pasta", category: "Kids", price: 200, image: "", is_food_of_day: true, preparation_time: 10, serving_time: 2},
  {id: 3, name: "Juice", category: "Drinks", price: 100, image: "", is_food_of_day: false},
];
const jsonResponse = (data) => ({ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data)});
function mount(component) { return render(<MemoryRouter><CartProvider>{component}</CartProvider></MemoryRouter>); }
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(meals))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Staff login", () => {
  it("hides password by default and toggles eye control", () => {
    mount(<StaffLogin />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", {name: "Show password"}));
    expect(input).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", {name: "Hide password"}));
    expect(input).toHaveAttribute("type", "password");
  });
  it("submits staff login with cookies", async () => {
    fetch.mockResolvedValue(jsonResponse({user: {id: 1, role: "manager"}, csrf_token: "csrf"}));
    mount(<StaffLogin />);
    fireEvent.change(screen.getByLabelText("Username"), {target: {value: "manager"}});
    fireEvent.change(screen.getByLabelText("Password"), {target: {value: "password123"}});
    fireEvent.click(screen.getByRole("button", {name: "Login"}));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({credentials: "include", method: "POST"})));
  });
});
describe("Menu integration", () => {
  it("forwards search and price query parameters", async () => {
    await getMeals("search=burger&min_price=100&max_price=600");
    expect(fetch).toHaveBeenCalledWith("/api/menu-items?search=burger&min_price=100&max_price=600", expect.any(Object));
  });
  it("renders every item, both daily meals, Kids and dynamic categories", async () => {
    mount(<Menu />);
    await screen.findByText("Juice");
    expect(screen.getAllByText("Burger")).toHaveLength(2);
    expect(screen.getAllByText("Kids Pasta")).toHaveLength(2);
    expect(screen.getByText(/Kids Meals/)).toBeInTheDocument();
    expect(screen.getByText(/Meal of the Day/)).toBeInTheDocument();
    expect(screen.queryByText("View Cart")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Available$/)).not.toBeInTheDocument();
  });
  it("debounces search and requests backend filtering", async () => {
    mount(<Menu />); await screen.findByText("Juice");
    const input = screen.getByPlaceholderText(/search/i);
    fetch.mockClear();
    fireEvent.change(input, {target: {value: "bur"}});
    expect(fetch).not.toHaveBeenCalled();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("search=bur"), expect.any(Object)));
  });
  it("requests combined min and max price filters", async () => {
    mount(<Menu />); await screen.findByText("Juice");
    fireEvent.change(screen.getByPlaceholderText("Min price (KSh)"), {target: {value: "200"}});
    fireEvent.change(screen.getByPlaceholderText("Max price (KSh)"), {target: {value: "500"}});
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("min_price=200&max_price=500"), expect.any(Object)));
  });
  it("shows empty state", async () => {
    fetch.mockResolvedValue(jsonResponse([])); mount(<Menu />);
    expect(await screen.findByText(/No meals found/)).toBeInTheDocument();
  });
  it("shows API error state", async () => {
    fetch.mockResolvedValue({ok: false}); mount(<Menu />);
    expect(await screen.findByText(/Unable to load menu/)).toBeInTheDocument();
  });
  it("compares two meals", async () => {
    mount(<Menu />); await screen.findByText("Juice");
    fireEvent.click(screen.getAllByRole("button", {name: "Compare"})[0]);
    fireEvent.click(screen.getAllByRole("button", {name: "Compare"})[0]);
    expect(screen.getByText("Compare Meals")).toBeInTheDocument();
  });
});
describe("Images and payment", () => {
  it("falls back when an image fails", () => {
    mount(<FoodCard food={meals[0]} />);
    fireEvent.error(screen.getByAltText("Burger"));
    expect(screen.getByAltText("Burger")).toHaveAttribute("src", FALLBACK_IMAGE);
  });
  it("resolves backend image paths and rejects unsafe schemes", () => {
    expect(imageUrl("/static/a.jpg")).toContain("/static/a.jpg");
    expect(imageUrl("javascript:bad")).toBe(FALLBACK_IMAGE);
    expect(imageUrl(null)).toBe(FALLBACK_IMAGE);
  });
  it("selects M-Pesa", () => {
    const select=vi.fn(); mount(<PaymentMethod selected="Cash" onSelect={select} />);
    fireEvent.click(screen.getByRole("button", {name:"M-Pesa"})); expect(select).toHaveBeenCalledWith("M-Pesa");
  });
});
describe("Staff operations", () => {
  it("renders multiple waiter cards and distinguishes off shift", async () => {
    fetch.mockResolvedValue(jsonResponse([{waiter_id:1,full_name:"First Waiter",status:"AVAILABLE"},{waiter_id:2,full_name:"Second Waiter",status:"OFF_SHIFT"}]));
    mount(<WaiterRoster />);
    expect(await screen.findByText("First Waiter")).toBeInTheDocument();
    expect(screen.getByText("Second Waiter")).toBeInTheDocument();
    expect(screen.getByText(/Off shift/)).toBeInTheDocument();
  });
  it("loads manager complaints, late orders, activity and meal selections", async () => {
    fetch.mockImplementation(async (url) => jsonResponse(url.includes("late-orders") ? [{id:1,customer:"Alice",table_number:"A1",status:"PREPARING",elapsed_minutes:35,expected_minutes:20}] : url.includes("complaints") ? [{id:1,customerName:"Alice",orderId:1,tableNumber:"A1",message:"Late meal",createdAt:new Date().toISOString(),status:"Open"}] : url.includes("waiter-activity") ? [{id:1,name:"First Waiter",on_shift:true,orders_served:2,tables_served:1,total_hours:2,shifts:[]}] : meals));
    mount(<ManagerOperations />);
    expect(await screen.findByText("Late meal")).toBeInTheDocument();
    expect(screen.getByText(/35 min elapsed/)).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByText(/First Waiter/)).toBeInTheDocument();
  });
});

import Navbar from "./components/Navbar";
import OrderConfirmation from "./components/checkout/OrderConfirmation";
describe("Cart and receipt", () => {
  it("renders the navigation cart count", () => {
    localStorage.setItem("quickbite_cart", JSON.stringify([{id:1,name:"Burger",price:500,quantity:3}]));
    mount(<Navbar />);
    expect(screen.getByRole("link",{name:"Cart (3 items)"})).toBeInTheDocument();
  });
  it("renders the confirmed receipt link and estimates", () => {
    mount(<OrderConfirmation order={{id:1,customerName:"Alice",tableNumber:"A1",paymentMethod:"Cash",paymentStatus:"Pending",total:500,items:[{id:1,name:"Burger",price:500,quantity:1}],receiptUrl:"/api/receipts/secure-token",preparationMinutes:15,servingMinutes:5}} />);
    expect(screen.getByRole("link",{name:"View / Print receipt"})).toHaveAttribute("href","/api/receipts/secure-token/view");
    expect(screen.getByText(/Preparation: 15 min/)).toBeInTheDocument();
  });
});

import Payment from "./pages/Payment";
describe("Checkout integrity", () => {
  function paymentPage() {
    localStorage.setItem("quickbite_cart",JSON.stringify([{id:1,name:"Burger",quantity:1,price:500}]));
    localStorage.setItem("quickbite_customer",JSON.stringify({fullName:"Alice",phone:"0712345678",tableNumber:"A1"}));
    return render(<MemoryRouter initialEntries={[{pathname:"/payment",state:{method:"Cash"}}]}><CartProvider><Navbar /><Payment /></CartProvider></MemoryRouter>);
  }
  it("keeps the cart and shows server errors without fabricating an order", async () => {
    fetch.mockResolvedValue({ok:false,json:async()=>({error:"Stock unavailable"})});
    paymentPage();fireEvent.click(screen.getByRole("button",{name:"Confirm order"}));
    expect(await screen.findByText("Stock unavailable")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("quickbite_orders") || "[]")).toHaveLength(0);
    expect(screen.getByRole("link",{name:"Cart (1 items)"})).toBeInTheDocument();
  });
  it("clears the context cart after server confirmation", async () => {
    fetch.mockResolvedValue(jsonResponse({order:{id:1,items:[],paymentStatus:"Pending"}}));
    paymentPage();fireEvent.click(screen.getByRole("button",{name:"Confirm order"}));
    await waitFor(()=>expect(screen.getByRole("link",{name:"Cart (0 items)"})).toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem("quickbite_cart"))).toEqual([]);
  });
});

describe("Checkout retries and photographs", () => {
  it("blocks duplicate clicks and sends one stable retry key", async () => {
    localStorage.setItem("quickbite_cart",JSON.stringify([{id:1,name:"Burger",quantity:1,price:500}]));
    localStorage.setItem("quickbite_customer",JSON.stringify({fullName:"Alice",phone:"0712345678",tableNumber:"A1"}));
    let finish;
    fetch.mockImplementation(async (url) => url.endsWith('/session') ? jsonResponse({}) : new Promise((resolve) => {finish=resolve;}));
    render(<MemoryRouter initialEntries={[{pathname:"/payment",state:{method:"Card"}}]}><CartProvider><Payment /></CartProvider></MemoryRouter>);
    const button=screen.getByRole('button',{name:'Confirm order'});
    fireEvent.click(button);fireEvent.click(button);
    await waitFor(()=>expect(fetch.mock.calls.filter(([url])=>url.endsWith('/orders'))).toHaveLength(1));
    const options=fetch.mock.calls.find(([url])=>url.endsWith('/orders'))[1];
    expect(options.headers['Idempotency-Key']).toMatch(/^[a-z0-9-]{36}$/);
    finish({ok:false,json:async()=>({error:'Temporary database error'})});
    await screen.findByText('Temporary database error');
    fireEvent.click(screen.getByRole('button',{name:'Confirm order'}));
    await waitFor(()=>expect(fetch.mock.calls.filter(([url])=>url.endsWith('/orders'))).toHaveLength(2));
    expect(fetch.mock.calls.filter(([url])=>url.endsWith('/orders'))[1][1].headers['Idempotency-Key']).toBe(options.headers['Idempotency-Key']);
    finish(jsonResponse({order:{id:2,items:[],paymentStatus:'Pending'}}));
  });
  it("keeps backend photo routes and rejects invalid/credential URLs", () => {
    expect(imageUrl('/api/menu-items/photos/beef-pilau.jpg')).toContain('/api/menu-items/photos/beef-pilau.jpg');
    expect(imageUrl('https://user:password@example.test/photo.jpg')).toBe(FALLBACK_IMAGE);
    expect(imageUrl(' https://[')).toBe(FALLBACK_IMAGE);
    expect(imageUrl(' data:text/html,bad')).toBe(FALLBACK_IMAGE);
  });
});

import { menuThumbnail } from "./services/api";
describe("Menu source and complete inventory", () => {
  it("loads the unfiltered inventory once, without a second request hiding products", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(meals)).mockRejectedValue(new Error('Second request must not be needed'));
    mount(<Menu />);
    expect(await screen.findByText('Juice')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('combobox',{name:'Menu category'}).querySelectorAll('option[value="All"]')).toHaveLength(1);
  });
  it("renders all 16 API products, including unavailable and newly added categories", async () => {
    const inventory=Array.from({length:16},(_,n)=>({id:n+1,name:`Product ${n+1}`,category:n===15?'New category':'Main',price:100+n,availability:n!==14,image:'https://example.test/meal.jpg'}));
    fetch.mockResolvedValue(jsonResponse(inventory));
    mount(<Menu />);
    await screen.findByText('Product 10');
    expect(screen.queryByText('Product 11')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name:'Previous'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name:'Next'}));
    for(const item of inventory.slice(10)) expect(screen.getByRole('heading',{name:item.name,exact:true})).toBeInTheDocument();
    expect(screen.getByRole('button', {name:'Next'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name:'Page 1'}));
    expect(screen.getByText('Product 1')).toBeInTheDocument();
    expect(screen.getByRole('option',{name:'New category'})).toBeInTheDocument();
  });
  it("ignores a stale failed filter response after a newer success", async () => {
    mount(<Menu />);await screen.findByText('Juice');
    let failOld;
    fetch.mockImplementation(async(url)=>url.includes('category=Main')?new Promise((_,reject)=>{failOld=reject;}):jsonResponse(meals));
    fireEvent.change(screen.getByRole('combobox',{name:'Menu category'}),{target:{value:'Main'}});
    await waitFor(()=>expect(failOld).toBeTypeOf('function'));
    fireEvent.change(screen.getByRole('combobox',{name:'Menu category'}),{target:{value:'All'}});
    await waitFor(()=>expect(fetch).toHaveBeenLastCalledWith('/api/menu-items',expect.any(Object)));
    failOld(new Error('Outdated request failed'));
    await waitFor(()=>expect(screen.queryByText('Outdated request failed')).not.toBeInTheDocument());
    expect(screen.getByText('Juice')).toBeInTheDocument();
  });
  it("uses smaller Cloudinary deliveries and preserves signed URLs",()=>{
    expect(menuThumbnail('https://res.cloudinary.com/example/image/upload/v123/food.png')).toBe('https://res.cloudinary.com/example/image/upload/f_auto,q_auto,w_800,c_limit/v123/food.png');
    const signed='https://res.cloudinary.com/example/image/upload/s--signed--/v123/food.jpg';
    expect(menuThumbnail(signed)).toBe(signed);
  });
});


describe("Original MealDB catalogue", () => {
  it("preserves external meal IDs, images and categories for details/cart", async () => {
    fetch.mockResolvedValue(jsonResponse([{id:"mealdb_52772",name:"Arrabiata",price:400,category:"Pasta",image:"https://www.themealdb.com/images/media/meals/test.jpg"}]));
    const meals=await getMeals();
    expect(meals[0].id).toBe("mealdb_52772");
    expect(menuThumbnail(meals[0].image)).toBe("https://www.themealdb.com/images/media/meals/test.jpg/preview");
    mount(<Menu />);
    expect(await screen.findByRole("heading",{name:"Arrabiata"})).toBeInTheDocument();
    expect(screen.getByRole("link",{name:"Arrabiata"})).toHaveAttribute("href","/menu/mealdb_52772");
  });
});

it("submits a MealDB cart ID unchanged to the order API",async()=>{
  localStorage.setItem("quickbite_cart",JSON.stringify([{id:"mealdb_52772",name:"Arrabiata",price:400,quantity:1}]));
  localStorage.setItem("quickbite_customer",JSON.stringify({fullName:"Guest",phone:"0712345678",tableNumber:"A1"}));
  fetch.mockImplementation(async(url)=>jsonResponse(url.endsWith('/session')?{}:{order:{id:2,items:[],paymentStatus:'Pending'}}));
  render(<MemoryRouter initialEntries={[{pathname:"/payment",state:{method:"Cash"}}]}><CartProvider><Payment /></CartProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole('button',{name:'Confirm order'}));
  await waitFor(()=>expect(fetch.mock.calls.some(([url])=>url.endsWith('/orders'))).toBe(true));
  const request=fetch.mock.calls.find(([url])=>url.endsWith('/orders'))[1];
  expect(JSON.parse(request.body).items[0].id).toBe('mealdb_52772');
});
