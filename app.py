from datetime import datetime
from flask import Flask, render_template, request
import requests

app = Flask(__name__)

def get_product_info(barcode):
    url = f"https://world.openfoodfacts.org/api/v0/product/{barcode}.json"
    print(f"Fetching product info from: {url}")
    response = requests.get(url)
    data = response.json()

    if data.get("status") == 1:
        product = data["product"]
        print(f"Product found: {product.get('product_name', 'Unknown')}")
        return {
            "product_name": product.get("product_name", "N/A"),
            "brands": product.get("brands", "N/A"),
            "categories": product.get("categories_old") or ", ".join(product.get("categories_tags", [])),
            "ingredients_text": product.get("ingredients_text_en") or product.get("ingredients_text", "Not available"),
            "allergens": ", ".join(
    [a.split(":")[-1].replace("-", " ").title() for a in product.get("allergens_tags", [])]
) or "None listed",
            "nutrition_grade": (product.get("nutrition_grades_tags", ["N/A"])[0]).upper() if product.get("nutrition_grades_tags") else "N/A",
            "image_url": product.get("image_front_small_url", None),
        }
    else:
        print("No product found for barcode.")
        return None


def search_products(query):
    """
    Search for products by name using the Open Food Facts API.
    """
    url = f"https://world.openfoodfacts.org/cgi/search.pl?search_terms={query}&json=1"
    response = requests.get(url)

    if response.status_code == 200:
        data = response.json()
        return data.get('products', [])
    else:
        return []

def check_fda_compliance(ingredients_list):
    """
    Check the ingredients list against the OpenFDA API for compliance.
    """
    fda_compliance_report = []
    
    for ingredient in ingredients_list:
        url = f"https://api.fda.gov/drug/label.json?search=active_ingredient:{ingredient}"
        response = requests.get(url)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('results'):
                fda_compliance_report.append(f"{ingredient}: FDA approved.")
            else:
                fda_compliance_report.append(f"{ingredient}: Not found in FDA approved list.")
        else:
            fda_compliance_report.append(f"{ingredient}: Not found in FDA approved list.")
    
    return fda_compliance_report

@app.route("/", methods=["GET", "POST"])
def index():
    product_info = None
    search_results = []
    fda_compliance_report = None
    current_year = datetime.now().year

    if request.method == "POST":
        barcode = request.form.get("barcode")
        query = request.form.get("query")

        if barcode:
            print(f"Barcode submitted: {barcode}")
            product_info = get_product_info(barcode)
            if not product_info:
                print("No product info found or failed to fetch.")

        if query:
            print(f"Search query: {query}")
            search_results = search_products(query)
            print(f"Search results found: {len(search_results)}")

    return render_template(
        "index.html",
        product_info=product_info,
        search_results=search_results,
        fda_compliance_report=fda_compliance_report,
        current_year=current_year
    )

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/contact")
def contact():
    current_year = datetime.now().year
    return render_template("contact.html", current_year=current_year)

@app.route("/help")
def help():
    current_year = datetime.now().year
    return render_template("help.html", current_year=current_year)
if __name__ == '__main__':
    app.run(debug=True)


