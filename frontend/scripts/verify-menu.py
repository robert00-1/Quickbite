"""Read-only full-menu check against the isolated MealDB-backed Vite on port 5176."""
import json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={"width":1280,"height":900})
    errors=[]
    page.on("pageerror",lambda e:errors.append(str(e)))
    page.route("**/api/**",lambda route:route.continue_() if route.request.method in ("GET","HEAD") else route.abort())
    response=page.request.get("http://127.0.0.1:5176/api/menu-items",timeout=120000)
    assert response.ok
    inventory=response.json()
    original=[meal for meal in inventory if meal.get("source")=="mealdb"]
    assert len(original)>100
    page.goto("http://127.0.0.1:5176/menu")
    page.get_by_role("heading",name=inventory[-1]["name"],exact=True).first.wait_for(timeout=120000)
    visible=set(page.locator("h3").all_text_contents())
    assert all(meal["name"] in visible for meal in inventory)
    sample={}
    for meal in original:sample.setdefault(meal["category"],meal)
    for meal in sample.values():
        image=page.get_by_alt_text(meal["name"],exact=True).first
        image.scroll_into_view_if_needed()
        page.wait_for_function("name => [...document.images].some(img => img.alt === name && img.complete && img.naturalWidth > 0)",arg=meal["name"])
        assert "meal-unavailable.svg" not in image.get_attribute("src"),meal["name"]
    page.get_by_placeholder("Search for a meal...").fill("Arrabiata")
    page.wait_for_timeout(1000)
    match=next(meal for meal in original if "arrabiata" in meal["name"].lower())
    page.get_by_role("link",name=match["name"],exact=True).first.click()
    page.get_by_role("heading",name=match["name"],exact=True).wait_for(timeout=30000)
    page.get_by_role("button",name="Add to Cart",exact=True).wait_for()
    print(json.dumps({"mealdb_products":len(original),"total_with_preserved_restaurant_items":len(inventory),"all_products_rendered":True,"sample_images_loaded":len(sample),"meal_details":True,"page_errors":errors}))
    assert not errors
    browser.close()
