import io
import zipfile
import xml.etree.ElementTree as ET

def extract_office_metadata(file_bytes: bytes) -> dict:
    """
    Извлича 'created' и 'creator' метаданни от .docx, .xlsx и .pptx файлове.
    """
    metadata = {"created": None, "author": None}
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            if "docProps/core.xml" in z.namelist():
                core_xml = z.read("docProps/core.xml")
                root = ET.fromstring(core_xml)
                
                # Namespaces в OpenXML
                ns = {
                    'dcterms': 'http://purl.org/dc/terms/',
                    'dc': 'http://purl.org/dc/elements/1.1/'
                }
                
                created_elem = root.find('dcterms:created', ns)
                if created_elem is not None:
                    metadata["created"] = created_elem.text

                creator_elem = root.find('dc:creator', ns)
                if creator_elem is not None:
                    metadata["author"] = creator_elem.text
    except Exception as e:
        print(f"Грешка при извличане на метаданни: {e}")
    
    return metadata