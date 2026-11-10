// The shop and its menu. Prices live ONLY here: the AI never decides a price.

export const SHOP = {
  name: "Sunny Crumbs Bakery",
  currency: "USD",
};

export const MENU = [
  { id: "lapis", name: "Layered Spice Cake (whole)", aka: "kue lapis, lapis legit", price: 24.0 },
  { id: "pandan", name: "Pandan Chiffon Cake", aka: "bolu pandan, chiffon pandan", price: 18.0 },
  { id: "brownie", name: "Fudgy Brownies (box of 9)", aka: "brownies, brownis", price: 15.0 },
  { id: "cookies", name: "Butter Cookies (jar)", aka: "kue kering, nastar-style cookies, kukis", price: 12.0 },
  { id: "bolu", name: "Steamed Sponge Cupcakes (6 pcs)", aka: "bolu kukus", price: 9.0 },
  { id: "cheese", name: "Cheese Tart (box of 4)", aka: "pie susu keju, tart keju", price: 14.0 },
];
