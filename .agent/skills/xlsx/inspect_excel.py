import pandas as pd

file_path = 'demo_horizontal_merge.xlsx'
try:
    # Read all sheets
    xls = pd.ExcelFile(file_path)
    sheet_names = xls.sheet_names
    print(f"Sheet names: {sheet_names}")

    for sheet_name in sheet_names:
        df = pd.read_excel(file_path, sheet_name=sheet_name)
        print(f"\n--- Sheet: {sheet_name} ---")
        print("Columns:", df.columns.tolist())
        print("First 5 rows:")
        print(df.head())
        print("-" * 30)

except Exception as e:
    print(f"Error reading excel file: {e}")
