import openpyxl
import csv
import os
from pathlib import Path

excel_path = "/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/Asistencia_Parroquial_DataScience_2026.xlsx"
sheets_dir = "/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export"

# Ensure sheets export directory exists
Path(sheets_dir).mkdir(parents=True, exist_ok=True)

# Mapping from sheet name to output CSV filename (as per migration guide)
sheet_to_csv = {
    "Lista de cumpleaños": "members.csv",
    "Estadistica": "stats.csv",
    "Asistencia": "attendance.csv",
    "Log_Asistencia": "attendance_log.csv",
    "Configuracion": "config.csv",
    "Caporales 2026": "caporales_2026.csv",
    "Polladas Pastoral": "polladas_pastoral.csv",
    "Votaciones_Aniversario": "votaciones_aniversario.csv",
    "Caja Luxto": "caja_luxto.csv",
    "Lista asistentes EJUTOR 2026": "lista_asistentes_ejutor_2026.csv",
    "Feedback_Asambleas": "feedback.csv",
    "Sugerencias": "suggestions.csv",
}

def export_sheet_to_csv(sheet_name, csv_filename):
    try:
        workbook = openpyxl.load_workbook(excel_path, read_only=True)
        sheet = workbook[sheet_name]
        csv_path = os.path.join(sheets_dir, csv_filename)
        with open(csv_path, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.writer(csvfile)
            for row in sheet.iter_rows(values_only=True):
                writer.writerow(row)
        workbook.close()
        print(f"Exported sheet '{sheet_name}' to {csv_path}")
        return True
    except Exception as e:
        print(f"Error exporting sheet '{sheet_name}': {e}")
        return False

def main():
    success_count = 0
    for sheet_name, csv_filename in sheet_to_csv.items():
        if export_sheet_to_csv(sheet_name, csv_filename):
            success_count += 1
    print(f"\nExport completed. Successfully exported {success_count}/{len(sheet_to_csv)} sheets.")
    print(f"CSV files are in: {sheets_dir}")

if __name__ == "__main__":
    main()