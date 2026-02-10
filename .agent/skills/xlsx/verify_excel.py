import pandas as pd

file_path = 'demo_horizontal_merge.xlsx'

def verify_excel():
    print(f"Verifying {file_path}...")
    xls = pd.ExcelFile(file_path)
    
    # Check Sheets
    if 'Salary Grades' not in xls.sheet_names:
        print("FAIL: 'Salary Grades' sheet missing!")
        return
        
    # Read Sheets
    df_main = pd.read_excel(file_path, sheet_name='Merge Demo')
    df_grades = pd.read_excel(file_path, sheet_name='Salary Grades')
    
    # Check Grade column in main
    if 'Grade' not in df_main.columns:
        print("FAIL: 'Grade' column missing in 'Merge Demo' sheet!")
    else:
        print("PASS: 'Grade' column found.")
        print(df_main[['Full Name', 'Grade']].head())
        
    # Check Grade content
    print("\nSalary Grades Content:")
    print(df_grades)
    
    # Try Merging
    print("\nTest Merge (Left Join on Grade):")
    merged_df = pd.merge(
        df_main, 
        df_grades, 
        left_on='Grade', 
        right_on='Grade Code', 
        how='left'
    )
    
    print(merged_df[['Full Name', 'Grade', 'Base Salary', 'Bonus Amount']].head())
    
    # Check if merge brought in data (check first row)
    first_row = merged_df.iloc[0]
    if pd.notna(first_row['Base Salary']):
        print("\nPASS: Merge successful, data populated.")
    else:
        print("\nFAIL: Merge failed or no match found for first row.")

if __name__ == "__main__":
    verify_excel()
