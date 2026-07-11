import os
import re

file_path = r"d:\INFORMATICS\FREELANCE\tourops\client\src\pages\admin\tour-generator.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add activeLang, translations state, and Languages lucide icon
content = content.replace(
    'import { Plus, Trash2, Save, ArrowLeft, Wand2, Calendar, MapPin, Info, Sparkles } from "lucide-react";',
    'import { Plus, Trash2, Save, ArrowLeft, Wand2, Calendar, MapPin, Info, Sparkles, Languages } from "lucide-react";'
)

state_add = """  const [duration, setDuration] = useState(1);
  const [category, setCategory] = useState("cultural");
  const [days, setDays] = useState<Partial<TourDay>[]>([]);
  const [translations, setTranslations] = useState<any>({});
  const [activeLang, setActiveLang] = useState("en");
"""
content = re.sub(r'  const \[duration, setDuration\] = useState\(1\);\s*const \[category, setCategory\] = useState\("cultural"\);\s*const \[days, setDays\] = useState<Partial<TourDay>\[\]>\(\[\]\);', state_add, content)

# 2. Update useEffect for selectedTourId
effect_old = """      const tour = tours?.find(t => t.id === selectedTourId);
      if (tour) {
        setTitle(tour.title);
        setDescription(tour.description || "");
        setDuration(tour.duration);
      }"""
effect_new = """      const tour = tours?.find(t => t.id === selectedTourId);
      if (tour) {
        setTitle(tour.title);
        setDescription(tour.description || "");
        setDuration(tour.duration);
        setTranslations((tour as any).translations || {});
      }"""
content = content.replace(effect_old, effect_new)

# 3. Add translateMutation
translate_mut = """
  const translateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        description,
        days: days.map(d => ({ title: d.title, description: d.description, activities: d.activities }))
      };
      const res = await apiRequest("POST", "/api/ai/translate-content", payload);
      return res.json();
    },
    onSuccess: (data) => {
      setTranslations({
        es: { title: data.es.title, description: data.es.description },
        id: { title: data.id.title, description: data.id.description }
      });
      setDays(prevDays => prevDays.map((d, i) => ({
        ...d,
        translations: {
          es: data.es.days?.[i] || {},
          id: data.id.days?.[i] || {}
        }
      })));
      toast({ title: "Auto-translated successfully!" });
    },
    onError: (e: Error) => toast({ title: "Translation failed", description: e.message, variant: "destructive" }),
  });
"""
content = content.replace("const handleAddDay = () => {", translate_mut + "\n  const handleAddDay = () => {")

# 4. Update saveMutation baseTourData
save_old = "const baseTourData = { title, description, duration, category };"
save_new = "const baseTourData = { title, description, duration, category, translations };"
content = content.replace(save_old, save_new)

# 5. Language Switcher UI
lang_switcher = """
        <div className="flex gap-2">
          <div className="flex bg-muted p-1 rounded-md">
            {["en", "es", "id"].map((lang) => (
              <button
                key={lang}
                onClick={() => setActiveLang(lang)}
                className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-all ${
                  activeLang === lang 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
          <Button 
            variant="outline" 
            onClick={() => translateMutation.mutate()} 
            disabled={translateMutation.isPending || selectedTourId === "new"}
            className="gap-2"
          >
            <Languages className="h-4 w-4" />
            {translateMutation.isPending ? "Translating..." : "Auto Translate"}
          </Button>
"""
content = content.replace('<div className="flex gap-2">', lang_switcher, 1)

# 6. Inputs for Tour
# Title
title_input_old = """              <Input 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}"""
title_input_new = """              <Input 
                value={activeLang === 'en' ? title : (translations?.[activeLang]?.title || '')} 
                onChange={(e) => {
                  if (activeLang === 'en') setTitle(e.target.value);
                  else setTranslations({ ...translations, [activeLang]: { ...translations?.[activeLang], title: e.target.value } });
                }}"""
content = content.replace(title_input_old, title_input_new)

# Description
desc_input_old = """            <Textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)}"""
desc_input_new = """            <Textarea 
              value={activeLang === 'en' ? description : (translations?.[activeLang]?.description || '')} 
              onChange={(e) => {
                  if (activeLang === 'en') setDescription(e.target.value);
                  else setTranslations({ ...translations, [activeLang]: { ...translations?.[activeLang], description: e.target.value } });
              }}"""
content = content.replace(desc_input_old, desc_input_new)

# 7. Inputs for Days
# Day Title
dtitle_old = """                    <Input 
                      value={day.title || ""} 
                      onChange={(e) => updateDay(index, "title", e.target.value)}"""
dtitle_new = """                    <Input 
                      value={activeLang === 'en' ? (day.title || "") : ((day as any).translations?.[activeLang]?.title || "")} 
                      onChange={(e) => {
                        if (activeLang === 'en') updateDay(index, "title", e.target.value);
                        else {
                          const trans = (day as any).translations || {};
                          updateDay(index, "translations", { ...trans, [activeLang]: { ...trans[activeLang], title: e.target.value } });
                        }
                      }}"""
content = content.replace(dtitle_old, dtitle_new)

# Day Description
ddesc_old = """                    <Textarea 
                      value={day.description || ""} 
                      onChange={(e) => updateDay(index, "description", e.target.value)}"""
ddesc_new = """                    <Textarea 
                      value={activeLang === 'en' ? (day.description || "") : ((day as any).translations?.[activeLang]?.description || "")} 
                      onChange={(e) => {
                        if (activeLang === 'en') updateDay(index, "description", e.target.value);
                        else {
                          const trans = (day as any).translations || {};
                          updateDay(index, "translations", { ...trans, [activeLang]: { ...trans[activeLang], description: e.target.value } });
                        }
                      }}"""
content = content.replace(ddesc_old, ddesc_new)

# Day Activities
dact_old = """                    <Textarea 
                      value={day.activities || ""} 
                      onChange={(e) => updateDay(index, "activities", e.target.value)}"""
dact_new = """                    <Textarea 
                      value={activeLang === 'en' ? (day.activities || "") : ((day as any).translations?.[activeLang]?.activities || "")} 
                      onChange={(e) => {
                        if (activeLang === 'en') updateDay(index, "activities", e.target.value);
                        else {
                          const trans = (day as any).translations || {};
                          updateDay(index, "translations", { ...trans, [activeLang]: { ...trans[activeLang], activities: e.target.value } });
                        }
                      }}"""
content = content.replace(dact_old, dact_new)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated tour-generator.tsx")
