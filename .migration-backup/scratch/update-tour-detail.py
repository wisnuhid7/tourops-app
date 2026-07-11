import os

file_path = r"d:\INFORMATICS\FREELANCE\tourops\client\src\pages\customer\tour-detail.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# We need to get language from useLanguage hook.
# Fortunately, useLanguage is already imported and we have const { language, t } = useLanguage();

# Helper to get field
# {tour.title} -> {language === 'en' ? tour.title : ((tour as any).translations?.[language]?.title || tour.title)}
# Same for description, highlights, inclusions, exclusions

# Title
content = content.replace(
    '          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-slate-800 leading-tight">',
    '          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-slate-800 leading-tight">'
)
content = content.replace(
    '{tour.title}',
    "{language === 'en' ? tour.title : ((tour as any).translations?.[language]?.title || tour.title)}"
)

# Description
content = content.replace(
    '{tour.description}',
    "{language === 'en' ? tour.description : ((tour as any).translations?.[language]?.description || tour.description)}"
)

# Highlights, Inclusions, Exclusions (split by \\n)
# Currently:
# (tour.highlights || "").split("\\n").map(...)

content = content.replace(
    '(tour.highlights || "").split("\\n")',
    '(language === \'en\' ? tour.highlights : ((tour as any).translations?.[language]?.highlights || tour.highlights) || "").split("\\n")'
)

content = content.replace(
    '(tour.inclusions || "").split("\\n")',
    '(language === \'en\' ? tour.inclusions : ((tour as any).translations?.[language]?.inclusions || tour.inclusions) || "").split("\\n")'
)

content = content.replace(
    '(tour.exclusions || "").split("\\n")',
    '(language === \'en\' ? tour.exclusions : ((tour as any).translations?.[language]?.exclusions || tour.exclusions) || "").split("\\n")'
)

# Itinerary Day title, description, activities
content = content.replace(
    '{day.title}',
    "{language === 'en' ? day.title : ((day as any).translations?.[language]?.title || day.title)}"
)
content = content.replace(
    '{day.description}',
    "{language === 'en' ? day.description : ((day as any).translations?.[language]?.description || day.description)}"
)
content = content.replace(
    '{day.activities}',
    "{language === 'en' ? day.activities : ((day as any).translations?.[language]?.activities || day.activities)}"
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated tour-detail.tsx")
