import openpyxl
import sys

excel_path = "/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/Asistencia_Parroquial_DataScience_2026.xlsx"

try:
    workbook = openpyxl.load_workbook(excel_path, read_only=True)
    print("Hojas en el archivo Excel:")
    for sheet_name in workbook.sheetnames:
        print(f"- {sheet_name}")
    workbook.close()
except Exception as e:
    print(f"Error al leer el archivo Excel: {e}")
    sys.exit(1)