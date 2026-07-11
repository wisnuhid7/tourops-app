import os
import re

file_path = r"d:\INFORMATICS\FREELANCE\tourops\client\src\pages\customer\tour-detail.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Import useLanguage
if "useLanguage" not in content:
    content = content.replace(
        'import { useAuth } from "@/hooks/use-auth";',
        'import { useAuth } from "@/hooks/use-auth";\nimport { useLanguage } from "@/hooks/use-language";'
    )

# Add useLanguage inside PublicGroupsList
if 'const { t } = useLanguage();' not in content.split('function PublicGroupsList')[1].split('return')[0]:
    content = content.replace(
        '  const { data: groups, isLoading } = useQuery<any[]>({',
        '  const { t } = useLanguage();\n  const { data: groups, isLoading } = useQuery<any[]>({'
    )

# Add useLanguage inside TourDetail
if 'const { t } = useLanguage();\n  const { data: tour' not in content:
    content = content.replace(
        '  const { data: tour, isLoading } = useQuery<Tour>({ queryKey: ["/api/tours", tourId] });',
        '  const { t } = useLanguage();\n  const { data: tour, isLoading } = useQuery<Tour>({ queryKey: ["/api/tours", tourId] });'
    )

# Replacements
reps = [
    ('Join an existing group:', '{t("join_existing_group")}'),
    ('Join Group</Link>', '{t("join_group")}</Link>'),
    ('Join Group:', '{t("join_group")}:'),
    ('You are joining a group for:', '{t("joining_group_for")}'),
    ('Departure: {', '{t("departure")} {'),
    ('Party Size (Including you)', '{t("party_size_including_you")}'),
    ('Confirm & Join Group', '{t("confirm_and_join")}'),
    ('Joining...', '{t("loading")}'),
    ('Back to Tours</Button>', '{t("back_to_tours")}</Button>'),
    ('View Brochure', '{t("view_brochure")}'),
    ('Starting from</p>', '{t("starting_from")}</p>'),
    ('Child: $', '{t("child_price")} $'),
    ('Single Supp: +$', '{t("single_supp")} +$'),
    ('Highlights</h3>', '{t("highlights")}</h3>'),
    ('Inclusions</h3>', '{t("inclusions")}</h3>'),
    ('Exclusions</h3>', '{t("exclusions")}</h3>'),
    ('Itinerary</h2>', '{t("itinerary")}</h2>'),
    ('Tour day #{', '{t("tour_day")} #{'),
    ('Activities & Sights</p>', '{t("activities_sights")}</p>'),
    ('Available Departures</h2>', '{t("available_departures")}</h2>'),
    ('No departures available at the moment</p>', '{t("no_departures")}</p>'),
    ('spots left</span>', '{t("spots_left")}</span>'),
    ('>Book Now<', '>{t("book_now")}<'),
    ('Book This Tour</DialogTitle>', '{t("book_this_tour")}</DialogTitle>'),
    ('Booking Type</Label>', '{t("booking_type")}</Label>'),
    ('>Join Public Group<', '>{t("join_public_group")}<'),
    ('>Create Leader Group<', '>{t("create_leader_group")}<'),
    ('>Private Family<', '>{t("private_family")}<'),
    ('Group Name</Label>', '{t("group_name")}</Label>'),
    ('Party Size</Label>', '{t("party_size")}</Label>'),
    ('Confirm Booking</Button>', '{t("confirm_booking")}</Button>'),
    ('Confirm Booking', '{t("confirm_booking")}'),
    ('Booking...', '{t("loading")}'),
    ('Sign In to Book</Button>', '{t("sign_in_to_book")}</Button>'),
    ('/person</span>', '/{t("per_person")}</span>'),
    ('>days<', '>{t("days")}<'),
    (' days<', ' {t("days")}<')
]

for old, new in reps:
    content = content.replace(old, new)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Done!")
