import docx
import sys

input_file = 'e:\\MINIMART\\supermarket-fe\\docx-TongKet\\ThucTapDoanhNghiepdemo.docx'

try:
    doc = docx.Document(input_file)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)

for i, p in enumerate(doc.paragraphs):
    text = p.text.strip().upper()
    if 'MỤC LỤC' in text or 'DANH MỤC' in text:
        print(f"Found at index {i}: {text}")
        if i > 50: # just want to check the beginning
            break
