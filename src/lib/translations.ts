/**
 * ═══════════════════════════════════════════════════════════════
 *  MIRACLE ERP — Translation Mappings
 * ═══════════════════════════════════════════════════════════════
 *
 *  HOW TO EDIT:
 *  1. Find the section for the page/feature you want to translate
 *  2. Update the `ar` value with your preferred Arabic text
 *  3. To add a new key, add it to the relevant section below
 *  4. Use the key in components via: const { t } = useLanguage(); t('key.name')
 *
 *  SECTIONS:
 *  • Navigation        — Sidebar menu items
 *  • Common             — Shared buttons, labels, statuses
 *  • Roles              — User role display names
 *  • Dashboard          — Dashboard page
 *  • Orders             — Orders list & detail pages
 *  • Manufacturing      — Manufacturing queue & phase
 *  • Finishing           — Finishing queue & phase
 *  • Packaging           — Packaging queue & phase
 *  • Boxing              — Boxing queue & phase
 *  • Warehouse           — Boxes / warehouse page
 *  • Extra Inventory     — Extra inventory page
 *  • Catalog             — Product catalog
 *  • Reports             — Reports & analytics
 *  • Admin               — User management
 *  • Auth                — Login / signup
 */

export type Language = 'en' | 'ar';

type TranslationEntry = { en: string; ar: string };

export const translations: Record<string, TranslationEntry> = {

  // ══════════════════════════════════════════
  //  NAVIGATION
  // ══════════════════════════════════════════
  "nav.dashboard":        { en: "Dashboard",          ar: "لوحة التحكم" },
  "nav.orders":           { en: "Orders",             ar: "الطلبات" },
  "nav.catalog":          { en: "Catalog",            ar: "الكتالوج" },
  "nav.manufacturing":    { en: "Manufacturing",      ar: "التصنيع" },
  "nav.finishing":        { en: "Finishing",           ar: "التشطيب" },
  "nav.packaging":        { en: "Packaging",          ar: "التعبئة" },
  "nav.boxing":           { en: "Boxing",             ar: "التعليب" },
  "nav.warehouse":        { en: "Warehouse",          ar: "المستودع" },
  "nav.extra_inventory":  { en: "Extra Inventory",    ar: "المخزون الإضافي" },
  "nav.machines":         { en: "Machines",           ar: "الماكينات" },
  "nav.reports":          { en: "Reports & Analytics", ar: "التقارير والتحليلات" },
  "nav.admin":            { en: "Admin",              ar: "الإدارة" },

  // ══════════════════════════════════════════
  //  COMMON — Buttons, labels, statuses
  // ══════════════════════════════════════════
  "common.save":            { en: "Save",             ar: "حفظ" },
  "common.cancel":          { en: "Cancel",           ar: "إلغاء" },
  "common.confirm":         { en: "Confirm",          ar: "تأكيد" },
  "common.delete":          { en: "Delete",           ar: "حذف" },
  "common.edit":            { en: "Edit",             ar: "تعديل" },
  "common.create":          { en: "Create",           ar: "إنشاء" },
  "common.search":          { en: "Search",           ar: "بحث" },
  "common.filter":          { en: "Filter",           ar: "تصفية" },
  "common.clear_filters":   { en: "Clear Filters",   ar: "مسح الفلاتر" },
  "common.export":          { en: "Export",           ar: "تصدير" },
  "common.loading":         { en: "Loading...",       ar: "جاري التحميل..." },
  "common.no_results":      { en: "No results found", ar: "لا توجد نتائج" },
  "common.back":            { en: "Back",             ar: "رجوع" },
  "common.close":           { en: "Close",            ar: "إغلاق" },
  "common.actions":         { en: "Actions",          ar: "إجراءات" },
  "common.status":          { en: "Status",           ar: "الحالة" },
  "common.date":            { en: "Date",             ar: "التاريخ" },
  "common.quantity":        { en: "Quantity",         ar: "الكمية" },
  "common.product":         { en: "Product",          ar: "المنتج" },
  "common.products":        { en: "Products",         ar: "المنتجات" },
  "common.customer":        { en: "Customer",         ar: "العميل" },
  "common.notes":           { en: "Notes",            ar: "ملاحظات" },
  "common.priority":        { en: "Priority",         ar: "الأولوية" },
  "common.total":           { en: "Total",            ar: "الإجمالي" },
  "common.units":           { en: "Units",            ar: "الوحدات" },
  "common.select":          { en: "Select",           ar: "اختيار" },
  "common.all":             { en: "All",              ar: "الكل" },
  "common.active":          { en: "Active",           ar: "نشط" },
  "common.inactive":        { en: "Inactive",         ar: "غير نشط" },
  "common.yes":             { en: "Yes",              ar: "نعم" },
  "common.no":              { en: "No",               ar: "لا" },
  "common.print":           { en: "Print",            ar: "طباعة" },
  "common.download":        { en: "Download",         ar: "تحميل" },

  // Status labels
  "status.pending":         { en: "Pending",          ar: "قيد الانتظار" },
  "status.in_progress":     { en: "In Progress",      ar: "قيد التنفيذ" },
  "status.completed":       { en: "Completed",        ar: "مكتمل" },
  "status.cancelled":       { en: "Cancelled",        ar: "ملغي" },

  // Priority labels
  "priority.low":           { en: "Low",              ar: "منخفض" },
  "priority.medium":        { en: "Medium",           ar: "متوسط" },
  "priority.high":          { en: "High",             ar: "عالي" },
  "priority.urgent":        { en: "Urgent",           ar: "عاجل" },

  // ══════════════════════════════════════════
  //  ROLES
  // ══════════════════════════════════════════
  "role.admin":                   { en: "Administrator",          ar: "مدير النظام" },
  "role.manufacturing_manager":   { en: "Manufacturing Manager",  ar: "مدير التصنيع" },
  "role.finishing_manager":       { en: "Finishing Manager",      ar: "مدير التشطيب" },
  "role.packaging_manager":       { en: "Packaging Manager",     ar: "مدير التعبئة" },
  "role.boxing_manager":          { en: "Boxing Manager",        ar: "مدير التعليب" },

  // ══════════════════════════════════════════
  //  APP HEADER
  // ══════════════════════════════════════════
  "header.miracle_erp":     { en: "Miracle ERP",        ar: "ميراكل ERP" },
  "header.production_system": { en: "Production System", ar: "نظام الإنتاج" },
  "header.logout":          { en: "Logout",             ar: "تسجيل الخروج" },

  // ══════════════════════════════════════════
  //  DASHBOARD
  // ══════════════════════════════════════════
  "dashboard.title":              { en: "Dashboard",                ar: "لوحة التحكم" },
  "dashboard.good_morning":       { en: "Good morning",             ar: "صباح الخير" },
  "dashboard.good_afternoon":     { en: "Good afternoon",           ar: "مساء الخير" },
  "dashboard.good_evening":       { en: "Good evening",             ar: "مساء الخير" },
  "dashboard.welcome_back":       { en: "Welcome back",             ar: "مرحباً بعودتك" },
  "dashboard.active_orders":      { en: "Active Orders",            ar: "الطلبات النشطة" },
  "dashboard.fulfillment_rate":   { en: "Fulfillment Rate",         ar: "معدل التنفيذ" },
  "dashboard.total_units":        { en: "Total Units",              ar: "إجمالي الوحدات" },
  "dashboard.ready_to_ship":      { en: "Ready to Ship",            ar: "جاهز للشحن" },
  "dashboard.production_pipeline": { en: "Production Pipeline",     ar: "خط الإنتاج" },
  "dashboard.throughput":         { en: "Throughput",               ar: "الإنتاجية" },
  "dashboard.top_products":       { en: "Top Products",             ar: "أفضل المنتجات" },
  "dashboard.top_machines":       { en: "Top Machines",             ar: "أفضل الماكينات" },
  "dashboard.queue_overview":     { en: "Queue Overview",           ar: "نظرة على الطوابير" },
  "dashboard.today":              { en: "Today",                    ar: "اليوم" },
  "dashboard.this_week":          { en: "This Week",                ar: "هذا الأسبوع" },
  "dashboard.this_month":         { en: "This Month",               ar: "هذا الشهر" },

  // ══════════════════════════════════════════
  //  ORDERS
  // ══════════════════════════════════════════
  "orders.title":             { en: "Orders",              ar: "الطلبات" },
  "orders.create":            { en: "Create Order",        ar: "إنشاء طلب" },
  "orders.order_number":      { en: "Order Number",        ar: "رقم الطلب" },
  "orders.order_detail":      { en: "Order Detail",        ar: "تفاصيل الطلب" },
  "orders.start_order":       { en: "Start Order",         ar: "بدء الطلب" },
  "orders.cancel_order":      { en: "Cancel Order",        ar: "إلغاء الطلب" },
  "orders.shipping_type":     { en: "Shipping Type",       ar: "نوع الشحن" },
  "orders.domestic":          { en: "Domestic",            ar: "محلي" },
  "orders.international":     { en: "International",       ar: "دولي" },
  "orders.estimated_time":    { en: "Estimated Fulfillment Time", ar: "وقت التنفيذ المتوقع" },
  "orders.raw_materials":     { en: "Raw Materials",       ar: "المواد الخام" },
  "orders.comments":          { en: "Comments",            ar: "التعليقات" },
  "orders.shipments":         { en: "Shipments",           ar: "الشحنات" },
  "orders.items":             { en: "Items",               ar: "العناصر" },
  "orders.extra_inventory":   { en: "Extra Inventory",     ar: "المخزون الإضافي" },

  // ══════════════════════════════════════════
  //  MANUFACTURING
  // ══════════════════════════════════════════
  "manufacturing.title":          { en: "Manufacturing",           ar: "التصنيع" },
  "manufacturing.queue":          { en: "Manufacturing Queue",     ar: "طابور التصنيع" },
  "manufacturing.in_progress":    { en: "In Manufacturing",        ar: "قيد التصنيع" },
  "manufacturing.assign_box":     { en: "Assign to Box",           ar: "تعيين إلى صندوق" },
  "manufacturing.assign_machine": { en: "Assign Machine",          ar: "تعيين ماكينة" },
  "manufacturing.move_to_extra":  { en: "Move to Extra",           ar: "نقل إلى المخزون الإضافي" },

  // ══════════════════════════════════════════
  //  FINISHING
  // ══════════════════════════════════════════
  "finishing.title":          { en: "Finishing",            ar: "التشطيب" },
  "finishing.queue":          { en: "Finishing Queue",      ar: "طابور التشطيب" },
  "finishing.in_progress":    { en: "In Finishing",         ar: "قيد التشطيب" },
  "finishing.accept_boxes":   { en: "Accept Boxes",         ar: "قبول الصناديق" },

  // ══════════════════════════════════════════
  //  PACKAGING
  // ══════════════════════════════════════════
  "packaging.title":          { en: "Packaging",            ar: "التعبئة" },
  "packaging.queue":          { en: "Packaging Queue",      ar: "طابور التعبئة" },
  "packaging.in_progress":    { en: "In Packaging",         ar: "قيد التعبئة" },

  // ══════════════════════════════════════════
  //  BOXING
  // ══════════════════════════════════════════
  "boxing.title":             { en: "Boxing",               ar: "التعليب" },
  "boxing.queue":             { en: "Boxing Queue",         ar: "طابور التعليب" },
  "boxing.in_progress":       { en: "In Boxing",            ar: "قيد التعليب" },
  "boxing.ready_for_shipment": { en: "Ready for Shipment",  ar: "جاهز للشحن" },
  "boxing.create_kartona":    { en: "Create Kartona",       ar: "إنشاء كرتونة" },

  // ══════════════════════════════════════════
  //  WAREHOUSE / BOXES
  // ══════════════════════════════════════════
  "warehouse.title":          { en: "Warehouse",            ar: "المستودع" },
  "warehouse.order_boxes":    { en: "Order Boxes",          ar: "صناديق الطلبات" },
  "warehouse.extra_boxes":    { en: "Extra Boxes",          ar: "الصناديق الإضافية" },
  "warehouse.create_boxes":   { en: "Create Boxes",         ar: "إنشاء صناديق" },
  "warehouse.box_code":       { en: "Box Code",             ar: "رمز الصندوق" },
  "warehouse.box_details":    { en: "Box Details",          ar: "تفاصيل الصندوق" },

  // ══════════════════════════════════════════
  //  EXTRA INVENTORY
  // ══════════════════════════════════════════
  "extra.title":              { en: "Extra Inventory",      ar: "المخزون الإضافي" },
  "extra.available":          { en: "Available",            ar: "متاح" },
  "extra.reserved":           { en: "Reserved",             ar: "محجوز" },
  "extra.consumed":           { en: "Consumed",             ar: "مستهلك" },

  // ══════════════════════════════════════════
  //  CATALOG
  // ══════════════════════════════════════════
  "catalog.title":            { en: "Product Catalog",      ar: "كتالوج المنتجات" },
  "catalog.add_product":      { en: "Add Product",          ar: "إضافة منتج" },
  "catalog.categories":       { en: "Categories",           ar: "الفئات" },
  "catalog.brands":           { en: "Brands",               ar: "العلامات التجارية" },
  "catalog.sku":              { en: "SKU",                  ar: "رمز المنتج" },
  "catalog.size":             { en: "Size",                 ar: "الحجم" },
  "catalog.color":            { en: "Color",                ar: "اللون" },
  "catalog.country":          { en: "Country",              ar: "البلد" },
  "catalog.bulk_upload":      { en: "Bulk Upload",          ar: "رفع جماعي" },

  // ══════════════════════════════════════════
  //  MACHINES
  // ══════════════════════════════════════════
  "machines.title":           { en: "Machines",             ar: "الماكينات" },
  "machines.add_machine":     { en: "Add Machine",          ar: "إضافة ماكينة" },
  "machines.machine_name":    { en: "Machine Name",         ar: "اسم الماكينة" },
  "machines.machine_type":    { en: "Machine Type",         ar: "نوع الماكينة" },

  // ══════════════════════════════════════════
  //  REPORTS
  // ══════════════════════════════════════════
  "reports.title":            { en: "Reports & Analytics",  ar: "التقارير والتحليلات" },
  "reports.production_flow":  { en: "Production Flow",      ar: "تدفق الإنتاج" },
  "reports.order_performance": { en: "Order Performance",   ar: "أداء الطلبات" },
  "reports.machine_production": { en: "Machine Production", ar: "إنتاج الماكينات" },
  "reports.inventory_boxes":  { en: "Inventory & Boxes",    ar: "المخزون والصناديق" },
  "reports.catalog_insights": { en: "Catalog Insights",     ar: "تحليلات الكتالوج" },
  "reports.exports":          { en: "Exports",              ar: "التصدير" },

  // ══════════════════════════════════════════
  //  ADMIN — User Management
  // ══════════════════════════════════════════
  "admin.title":              { en: "User Management",      ar: "إدارة المستخدمين" },
  "admin.create_user":        { en: "Create User",          ar: "إنشاء مستخدم" },
  "admin.edit_user":          { en: "Edit User",            ar: "تعديل مستخدم" },
  "admin.delete_user":        { en: "Delete User",          ar: "حذف مستخدم" },
  "admin.email":              { en: "Email",                ar: "البريد الإلكتروني" },
  "admin.full_name":          { en: "Full Name",            ar: "الاسم الكامل" },
  "admin.primary_role":       { en: "Primary Role",         ar: "الدور الرئيسي" },
  "admin.additional_roles":   { en: "Additional Roles",     ar: "أدوار إضافية" },
  "admin.password":           { en: "Password",             ar: "كلمة المرور" },

  // ══════════════════════════════════════════
  //  AUTH — Login / Signup
  // ══════════════════════════════════════════
  "auth.sign_in":             { en: "Sign In",              ar: "تسجيل الدخول" },
  "auth.sign_up":             { en: "Sign Up",              ar: "إنشاء حساب" },
  "auth.email":               { en: "Email",                ar: "البريد الإلكتروني" },
  "auth.password":            { en: "Password",             ar: "كلمة المرور" },
  "auth.welcome":             { en: "Welcome to Miracle ERP", ar: "مرحباً بك في ميراكل ERP" },

  // ══════════════════════════════════════════
  //  SHIPMENTS
  // ══════════════════════════════════════════
  "shipments.title":          { en: "Shipments",            ar: "الشحنات" },
  "shipments.code":           { en: "Shipment Code",        ar: "رمز الشحنة" },
  "shipments.seal":           { en: "Seal",                 ar: "ختم" },
  "shipments.sealed":         { en: "Sealed",               ar: "مختوم" },
  "shipments.open":           { en: "Open",                 ar: "مفتوح" },
  "shipments.weight":         { en: "Weight (kg)",          ar: "الوزن (كجم)" },
  "shipments.dimensions":     { en: "Dimensions",           ar: "الأبعاد" },

  // ══════════════════════════════════════════
  //  BATCH / PRODUCTION STATES
  // ══════════════════════════════════════════
  "state.waiting_for_rm":     { en: "Waiting for Raw Material",       ar: "في انتظار المواد الخام" },
  "state.in_manufacturing":   { en: "In Manufacturing",               ar: "قيد التصنيع" },
  "state.manufactured":       { en: "Manufactured",                   ar: "تم التصنيع" },
  "state.waiting_for_pm":     { en: "Waiting for Packaging Material", ar: "في انتظار مواد التعبئة" },
  "state.in_packaging":       { en: "In Packaging",                   ar: "قيد التعبئة" },
  "state.packaged":           { en: "Packaged",                       ar: "تم التعبئة" },
  "state.waiting_for_bm":     { en: "Waiting for Boxing Material",    ar: "في انتظار مواد التعليب" },
  "state.in_boxing":          { en: "In Boxing",                      ar: "قيد التعليب" },
  "state.boxed":              { en: "Boxed",                          ar: "تم التعليب" },
  "state.qced":               { en: "QC Passed",                      ar: "اجتاز الفحص" },
  "state.finished":           { en: "Finished",                       ar: "منتهي" },
  "state.ready_for_finishing":  { en: "Ready for Finishing",           ar: "جاهز للتشطيب" },
  "state.ready_for_packaging":  { en: "Ready for Packaging",          ar: "جاهز للتعبئة" },
  "state.ready_for_boxing":     { en: "Ready for Boxing",             ar: "جاهز للتعليب" },
  "state.ready_for_shipment":   { en: "Ready for Shipment",           ar: "جاهز للشحن" },

  // ══════════════════════════════════════════
  //  CUSTOMERS
  // ══════════════════════════════════════════
  "customers.title":          { en: "Customers",            ar: "العملاء" },
  "customers.add":            { en: "Add Customer",         ar: "إضافة عميل" },
  "customers.name":           { en: "Customer Name",        ar: "اسم العميل" },
  "customers.code":           { en: "Customer Code",        ar: "رمز العميل" },
};
