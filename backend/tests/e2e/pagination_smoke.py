import json
from playwright.sync_api import sync_playwright
meals=[dict(id=i,name=f'Pagination Meal {i}',category='Main',price=500,availability=True,stock_quantity=30,is_food_of_day=False,preparation_time=10,serving_time=3) for i in range(1,24)]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':390,'height':844})
    page.route('**/api/menu-items*',lambda route:route.fulfill(json=meals) if route.request.method=='GET' and '/photos/' not in route.request.url else route.continue_())
    page.goto('http://127.0.0.1:5176/menu')
    section=page.get_by_role('region',name='Meals Available',exact=True)
    section.get_by_text('Pagination Meal 10',exact=True).wait_for()
    assert section.get_by_role('heading',level=3).count()==10
    nav=page.get_by_role('navigation',name='Meals Available pagination')
    nav.get_by_role('button',name='Page 3').click()
    assert section.get_by_role('heading',level=3).count()==3
    assert nav.get_by_role('button',name='Next').is_disabled()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.goto('http://127.0.0.1:5176/staff-login')
    page.get_by_label('Username',exact=True).fill('manager')
    page.get_by_label('Password',exact=True).fill('runtime-password')
    page.get_by_role('button',name='Login',exact=True).click()
    page.wait_for_url('**/manager')
    for label in ['Manager Meals Available pagination','Service and meal management pagination']:
        nav=page.get_by_role('navigation',name=label,exact=True)
        nav.get_by_role('button',name='Page 3').click()
        assert nav.get_by_role('button',name='Next').is_disabled()
        assert '21–23 of 23' in nav.inner_text()
    assert page.locator('[aria-label="Meal management records"] > div').count()==3
    print(json.dumps({'customer_mobile_pagination':'passed','manager_available_pagination':'passed','meal_of_day_estimates_pagination':'passed','source':'23 mocked menu records; real isolated staff authentication'}))
    browser.close()
