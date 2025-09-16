import re
from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()

    try:
        # 1. Go to the application's home page, but wait for DOM content to be loaded.
        # This might be faster and less prone to timeout if external resources are slow.
        page.goto("http://localhost:3000/", wait_until="domcontentloaded")

        # 2. Print the page content for debugging.
        print("--- Page Content ---")
        print(page.content())
        print("--------------------")

        # 3. Wait for the main heading to be visible to ensure the page is loaded.
        heading = page.get_by_role("heading", name="Novel to Manga Converter")
        expect(heading).to_be_visible(timeout=10000) # shorter timeout

        # 4. Take a screenshot of the page.
        page.screenshot(path="jules-scratch/verification/homepage.png")
        print("\nScreenshot taken successfully!")

    except Exception as e:
        print(f"\nAn error occurred: {e}")
        # Try to take a screenshot even on error for debugging.
        page.screenshot(path="jules-scratch/verification/error.png")
        print("Error screenshot taken.")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
