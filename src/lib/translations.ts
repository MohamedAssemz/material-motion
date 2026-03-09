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
  "common.view":            { en: "View",             ar: "عرض" },
  "common.items":           { en: "items",            ar: "عناصر" },

  // Status labels
  "status.pending":         { en: "Pending",          ar: "قيد الانتظار" },
  "status.in_progress":     { en: "In Progress",      ar: "قيد التنفيذ" },
  "status.completed":       { en: "Completed",        ar: "مكتمل" },
  "status.cancelled":       { en: "Cancelled",        ar: "ملغي" },
  "status.not_started":     { en: "Not Started",      ar: "لم يبدأ" },
  "status.fulfilled":       { en: "Fulfilled",        ar: "مكتمل" },

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
  "dashboard.last_30_days":       { en: "Last 30 Days",             ar: "آخر 30 يوم" },
  "dashboard.factory_overview":   { en: "Here's your factory overview", ar: "نظرة عامة على المصنع" },
  "dashboard.new_orders":         { en: "New Orders",               ar: "طلبات جديدة" },
  "dashboard.late_orders":        { en: "Late Orders",              ar: "طلبات متأخرة" },
  "dashboard.completed":          { en: "Completed",                ar: "مكتمل" },
  "dashboard.extra_inventory":    { en: "Extra Inventory",          ar: "المخزون الإضافي" },
  "dashboard.with_late_batches":  { en: "With late batches",        ar: "مع دفعات متأخرة" },
  "dashboard.available_items":    { en: "Available items",          ar: "العناصر المتاحة" },
  "dashboard.items_ready_shipment": { en: "items ready for shipment", ar: "عناصر جاهزة للشحن" },
  "dashboard.ready_to_kartona":   { en: "Ready to be added to a Kartona", ar: "جاهز للإضافة إلى كرتونة" },
  "dashboard.item_distribution":  { en: "Item distribution across phases", ar: "توزيع العناصر عبر المراحل" },
  "dashboard.order_status_breakdown": { en: "Order Status Breakdown", ar: "توزيع حالات الطلبات" },
  "dashboard.distribution_by_status": { en: "Distribution by status", ar: "التوزيع حسب الحالة" },
  "dashboard.no_orders_yet":      { en: "No orders yet",            ar: "لا توجد طلبات بعد" },
  "dashboard.orders_label":       { en: "orders",                   ar: "طلبات" },
  "dashboard.most_completed_in":  { en: "Most completed in",        ar: "الأكثر اكتمالاً في" },
  "dashboard.avg_finished_day":   { en: "Avg. Finished / Day",      ar: "متوسط الإنتاج / يوم" },
  "dashboard.items_per_day":      { en: "items per day",            ar: "عناصر في اليوم" },
  "dashboard.daily_average_in":   { en: "Daily average in",         ar: "المتوسط اليومي في" },
  "dashboard.most_used_machines": { en: "Most Used Machines",       ar: "أكثر الماكينات استخداماً" },
  "dashboard.by_production_records": { en: "By production records in", ar: "حسب سجلات الإنتاج في" },
  "dashboard.no_completed_yet":   { en: "No completed items yet",   ar: "لا توجد عناصر مكتملة بعد" },
  "dashboard.no_machine_activity": { en: "No machine activity yet", ar: "لا يوجد نشاط للماكينات بعد" },
  "dashboard.production_queues":  { en: "Production Queues",        ar: "طوابير الإنتاج" },
  "dashboard.waiting":            { en: "Waiting",                  ar: "في الانتظار" },
  "dashboard.ready":              { en: "Ready",                    ar: "جاهز" },
  "dashboard.active_label":       { en: "Active",                   ar: "نشط" },
  "dashboard.alerts_attention":   { en: "Alerts & Attention",       ar: "التنبيهات والانتباه" },
  "dashboard.items_needing_attention": { en: "Items needing your attention", ar: "عناصر تحتاج انتباهك" },
  "dashboard.all_clear":          { en: "All clear!",               ar: "الأمور جيدة!" },
  "dashboard.no_alerts_desc":     { en: "No late batches, upcoming deadlines, or stalled orders.", ar: "لا توجد دفعات متأخرة أو مواعيد قادمة أو طلبات متوقفة." },
  "dashboard.late":               { en: "Late",                     ar: "متأخر" },
  "dashboard.stalled":            { en: "Stalled",                  ar: "متوقف" },
  "dashboard.approaching_deadline": { en: "Approaching Deadline",   ar: "اقتراب الموعد النهائي" },
  "dashboard.overdue":            { en: "overdue",                  ar: "متأخر" },
  "dashboard.no_updates_for":     { en: "No updates for",           ar: "لا تحديثات منذ" },
  "dashboard.due":                { en: "Due",                      ar: "الموعد" },
  "dashboard.items_processed_per_phase": { en: "Items processed per phase", ar: "العناصر المعالجة لكل مرحلة" },
  "dashboard.no_production_recorded":    { en: "No production recorded",    ar: "لم يتم تسجيل أي إنتاج" },
  "dashboard.shipments":          { en: "shipments",                ar: "شحنات" },
  "dashboard.ops":                { en: "ops",                      ar: "عمليات" },

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
  "orders.total_items":       { en: "Total Items",         ar: "إجمالي العناصر" },
  "orders.shipped":           { en: "Shipped",             ar: "تم الشحن" },
  "orders.added_to_extra":    { en: "Added to Extra",      ar: "أُضيف للمخزون الإضافي" },
  "orders.shipping":          { en: "Shipping",            ar: "الشحن" },
  "orders.eft":               { en: "EFT",                 ar: "وقت التنفيذ" },
  "orders.not_set":           { en: "Not set",             ar: "غير محدد" },
  "orders.production_timeline": { en: "Production Timeline", ar: "الجدول الزمني للإنتاج" },
  "orders.start_to_track":    { en: "Start the order to begin tracking progress", ar: "ابدأ الطلب لبدء تتبع التقدم" },
  "orders.track_progress":    { en: "Track progress through each phase", ar: "تتبع التقدم عبر كل مرحلة" },
  "orders.timeline_inactive": { en: "Timeline Inactive",   ar: "الجدول الزمني غير نشط" },
  "orders.click_start":       { en: "Click \"Start Order\" to begin production", ar: "اضغط \"بدء الطلب\" لبدء الإنتاج" },
  "orders.items_planned":     { en: "items planned",       ar: "عناصر مخطط لها" },
  "orders.waiting":           { en: "Waiting",             ar: "في الانتظار" },
  "orders.in_progress_label": { en: "In Progress",         ar: "قيد التنفيذ" },
  "orders.processed":         { en: "Processed",           ar: "تمت المعالجة" },
  "orders.retrieved":         { en: "Retrieved",           ar: "تم الاسترجاع" },
  "orders.added_to_extra_label": { en: "Added to Extra",   ar: "أُضيف للإضافي" },
  "orders.extra_to_retrieve": { en: "Extra (to retrieve)", ar: "إضافي (للاسترجاع)" },
  "orders.completed_label":   { en: "Completed",           ar: "مكتمل" },
  "orders.available_extra":   { en: "Available extra items that can be used for this order", ar: "العناصر الإضافية المتاحة لهذا الطلب" },
  "orders.view_shipments":    { en: "View Shipments",      ar: "عرض الشحنات" },
  "orders.items_shipped":     { en: "items shipped",       ar: "عناصر تم شحنها" },
  "orders.view_manage_shipments": { en: "View and manage order shipments", ar: "عرض وإدارة شحنات الطلب" },
  "orders.order_items":       { en: "Order Items",         ar: "عناصر الطلب" },
  "orders.products_in_order": { en: "Products included in this order", ar: "المنتجات في هذا الطلب" },
  "orders.packing":           { en: "Packing",             ar: "التعبئة" },
  "orders.boxing_col":        { en: "Boxing",              ar: "التعليب" },
  "orders.progress":          { en: "Progress",            ar: "التقدم" },
  "orders.go_back":           { en: "Go Back",             ar: "رجوع" },
  "orders.cancel_confirm_desc": { en: "This will cancel the order and release any reserved extra inventory. The order will be moved to the Cancelled tab. This action cannot be undone.", ar: "سيتم إلغاء الطلب وتحرير أي مخزون إضافي محجوز. سيتم نقل الطلب إلى قسم الملغي. لا يمكن التراجع عن هذا الإجراء." },
  "orders.high_priority":     { en: "High Priority",       ar: "أولوية عالية" },
  "orders.no_customer":       { en: "No Customer",         ar: "بدون عميل" },
  "orders.not_found":         { en: "Order not found",     ar: "الطلب غير موجود" },
  "orders.back_to_orders":    { en: "Back to Orders",      ar: "العودة للطلبات" },
  "orders.packaging_reference": { en: "Packaging Reference", ar: "مرجع التعبئة" },

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
  "warehouse.box_management": { en: "Box Management",       ar: "إدارة الصناديق" },
  "warehouse.manage_desc":    { en: "Manage order and extra inventory boxes", ar: "إدارة صناديق الطلبات والمخزون الإضافي" },
  "warehouse.scan":           { en: "Scan",                 ar: "مسح" },
  "warehouse.print_labels":   { en: "Print Labels",         ar: "طباعة الملصقات" },
  "warehouse.create_order_boxes": { en: "Create Order Boxes", ar: "إنشاء صناديق طلبات" },
  "warehouse.create_extra_boxes": { en: "Create Extra Boxes", ar: "إنشاء صناديق إضافية" },
  "warehouse.num_boxes":      { en: "Number of boxes to create", ar: "عدد الصناديق المراد إنشاؤها" },
  "warehouse.box_auto_gen":   { en: "Box codes will be auto-generated (e.g., BOX-0001)", ar: "سيتم توليد رموز الصناديق تلقائياً (مثال: BOX-0001)" },
  "warehouse.ebox_auto_gen":  { en: "Box codes will be auto-generated (e.g., EBOX-0001)", ar: "سيتم توليد رموز الصناديق تلقائياً (مثال: EBOX-0001)" },
  "warehouse.empty_boxes":    { en: "Empty Boxes",          ar: "صناديق فارغة" },
  "warehouse.occupied_boxes": { en: "Occupied Boxes",       ar: "صناديق مشغولة" },
  "warehouse.inactive_boxes": { en: "Inactive Boxes",       ar: "صناديق غير نشطة" },
  "warehouse.no_order_boxes": { en: "No order boxes created yet", ar: "لم يتم إنشاء صناديق طلبات بعد" },
  "warehouse.create_to_start": { en: "Create boxes to start tracking order batches", ar: "أنشئ صناديق لبدء تتبع دفعات الطلبات" },
  "warehouse.no_extra_boxes": { en: "No extra boxes created yet", ar: "لم يتم إنشاء صناديق إضافية بعد" },
  "warehouse.create_extra_to_start": { en: "Create extra boxes to store surplus inventory", ar: "أنشئ صناديق إضافية لتخزين المخزون الفائض" },
  "warehouse.no_filter_match": { en: "No boxes match the current filters", ar: "لا توجد صناديق تطابق الفلاتر الحالية" },
  "warehouse.all_statuses":   { en: "All Statuses",         ar: "جميع الحالات" },
  "warehouse.empty":          { en: "Empty",                ar: "فارغ" },
  "warehouse.occupied":       { en: "Occupied",             ar: "مشغول" },
  "warehouse.any_batches":    { en: "Any Batches",          ar: "أي دفعات" },
  "warehouse.any_qty":        { en: "Any Qty",              ar: "أي كمية" },
  "warehouse.from":           { en: "From:",                ar: "من:" },
  "warehouse.to":             { en: "To:",                  ar: "إلى:" },
  "warehouse.pick_date":      { en: "Pick date",            ar: "اختر تاريخ" },
  "warehouse.batches":        { en: "Batches",              ar: "الدفعات" },
  "warehouse.total_qty":      { en: "Total Qty",            ar: "إجمالي الكمية" },
  "warehouse.search_box":     { en: "Search by box number (e.g. 42)...", ar: "ابحث برقم الصندوق (مثال: 42)..." },
  "warehouse.box_found":      { en: "Box Found",            ar: "تم العثور على الصندوق" },
  "warehouse.opened_details": { en: "Opened details for",   ar: "تم فتح تفاصيل" },

  // ══════════════════════════════════════════
  //  EXTRA INVENTORY
  // ══════════════════════════════════════════
  "extra.title":              { en: "Extra Inventory",      ar: "المخزون الإضافي" },
  "extra.available":          { en: "Available",            ar: "متاح" },
  "extra.reserved":           { en: "Reserved",             ar: "محجوز" },
  "extra.consumed":           { en: "Consumed",             ar: "مستهلك" },
  "extra.batch_tracking":     { en: "Batch-based surplus inventory tracking", ar: "تتبع المخزون الفائض بناءً على الدفعات" },
  "extra.add_batch":          { en: "Add Extra Batch",      ar: "إضافة دفعة إضافية" },
  "extra.create_batch":       { en: "Create Extra Inventory Batch", ar: "إنشاء دفعة مخزون إضافي" },
  "extra.select_product":     { en: "Select product",       ar: "اختر المنتج" },
  "extra.current_state":      { en: "Current State",        ar: "الحالة الحالية" },
  "extra.state_desc":         { en: "Current production state of these extra units", ar: "حالة الإنتاج الحالية لهذه الوحدات الإضافية" },
  "extra.select_ebox":        { en: "Select an EBox...",     ar: "اختر صندوق إضافي..." },
  "extra.only_matching_state": { en: "Only boxes matching the selected state are shown.", ar: "يتم عرض الصناديق المطابقة للحالة المحددة فقط." },
  "extra.creating":           { en: "Creating...",          ar: "جاري الإنشاء..." },
  "extra.create_batch_btn":   { en: "Create Batch",         ar: "إنشاء دفعة" },
  "extra.available_units":    { en: "Available Units",       ar: "الوحدات المتاحة" },
  "extra.available_batches":  { en: "Available Batches",     ar: "الدفعات المتاحة" },
  "extra.reserved_count":     { en: "Reserved",              ar: "محجوز" },
  "extra.search_product_sku": { en: "Search by product name or SKU...", ar: "ابحث باسم المنتج أو رمز المنتج..." },
  "extra.all_states":         { en: "All States",            ar: "جميع الحالات" },
  "extra.all_statuses":       { en: "All Statuses",          ar: "جميع الحالات" },
  "extra.extra_batches":      { en: "Extra Inventory Batches", ar: "دفعات المخزون الإضافي" },
  "extra.no_batches":         { en: "No extra inventory batches", ar: "لا توجد دفعات مخزون إضافي" },
  "extra.create_when_overproduction": { en: "Create batches when overproduction occurs", ar: "أنشئ دفعات عند حدوث إنتاج زائد" },
  "extra.no_filter_match":    { en: "No batches match the current filters", ar: "لا توجد دفعات تطابق الفلاتر الحالية" },
  "extra.assign":             { en: "Assign",               ar: "تعيين" },
  "extra.assign_box":         { en: "Assign Extra Box",      ar: "تعيين صندوق إضافي" },
  "extra.delete_batch":       { en: "Delete Extra Batch",    ar: "حذف دفعة إضافية" },
  "extra.delete_confirm":     { en: "Are you sure you want to delete this extra batch", ar: "هل أنت متأكد من حذف هذه الدفعة الإضافية" },
  "extra.reserved_release":   { en: "This batch is currently reserved for an order. Deleting it will release the reservation.", ar: "هذه الدفعة محجوزة حالياً لطلب. حذفها سيؤدي إلى تحرير الحجز." },
  "extra.cannot_undo":        { en: "This action cannot be undone.", ar: "لا يمكن التراجع عن هذا الإجراء." },
  "extra.select_box_title":   { en: "Select Extra Box for Batch", ar: "اختر صندوق إضافي للدفعة" },
  "extra.state_mismatch":     { en: "State Mismatch",        ar: "عدم تطابق الحالة" },
  "extra.validation_error":   { en: "Validation Error",      ar: "خطأ في التحقق" },
  "extra.select_product_valid": { en: "Please select a product and enter a valid quantity", ar: "يرجى اختيار منتج وإدخال كمية صالحة" },
  "extra.select_ebox_valid":  { en: "Please select an Extra Box (EBox) for this batch", ar: "يرجى اختيار صندوق إضافي لهذه الدفعة" },

  // Extra state labels
  "extra.state.extra_manufacturing": { en: "Extra Manufacturing", ar: "تصنيع إضافي" },
  "extra.state.extra_finishing":     { en: "Extra Finishing",     ar: "تشطيب إضافي" },
  "extra.state.extra_packaging":     { en: "Extra Packaging",    ar: "تعبئة إضافية" },
  "extra.state.extra_boxing":        { en: "Extra Boxing",       ar: "تعليب إضافي" },

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
  "state.shipped":              { en: "Shipped",                      ar: "تم الشحن" },
  "state.in_finishing":         { en: "In Finishing",                  ar: "قيد التشطيب" },
  "state.manufacturing":        { en: "Manufacturing",                ar: "التصنيع" },
  "state.finishing":            { en: "Finishing",                     ar: "التشطيب" },
  "state.packaging":            { en: "Packaging",                    ar: "التعبئة" },
  "state.boxing":               { en: "Boxing",                       ar: "التعليب" },

  // ══════════════════════════════════════════
  //  CUSTOMERS
  // ══════════════════════════════════════════
  "customers.title":          { en: "Customers",            ar: "العملاء" },
  "customers.add":            { en: "Add Customer",         ar: "إضافة عميل" },
  "customers.name":           { en: "Customer Name",        ar: "اسم العميل" },
  "customers.code":           { en: "Customer Code",        ar: "رمز العميل" },

  // ══════════════════════════════════════════
  //  TABLE HEADERS
  // ══════════════════════════════════════════
  "table.order":              { en: "Order",                ar: "الطلب" },
  "table.customer":           { en: "Customer",             ar: "العميل" },
  "table.status":             { en: "Status",               ar: "الحالة" },
  "table.items":              { en: "Items",                ar: "العناصر" },
  "table.total_units":        { en: "Total Units",          ar: "إجمالي الوحدات" },
  "table.date":               { en: "Date",                 ar: "التاريخ" },
  "table.actions":            { en: "Actions",              ar: "إجراءات" },
  "table.product":            { en: "Product",              ar: "المنتج" },
  "table.sku":                { en: "SKU",                  ar: "رمز المنتج" },
  "table.quantity":           { en: "Quantity",             ar: "الكمية" },
  "table.state":              { en: "State",                ar: "الحالة" },
  "table.priority":           { en: "Priority",             ar: "الأولوية" },
  "table.shipping":           { en: "Shipping",             ar: "الشحن" },
  "table.eft":                { en: "EFT",                  ar: "وقت التنفيذ" },
  "table.created":            { en: "Created",              ar: "تاريخ الإنشاء" },
  "table.updated":            { en: "Updated",              ar: "تاريخ التحديث" },
  "table.machine":            { en: "Machine",              ar: "الماكينة" },
  "table.box":                { en: "Box",                  ar: "الصندوق" },
  "table.user":               { en: "User",                 ar: "المستخدم" },
  "table.role":               { en: "Role",                 ar: "الدور" },

  // ══════════════════════════════════════════
  //  FORM LABELS
  // ══════════════════════════════════════════
  "form.name":                { en: "Name",                 ar: "الاسم" },
  "form.email":               { en: "Email",                ar: "البريد الإلكتروني" },
  "form.password":            { en: "Password",             ar: "كلمة المرور" },
  "form.confirm_password":    { en: "Confirm Password",     ar: "تأكيد كلمة المرور" },
  "form.description":         { en: "Description",          ar: "الوصف" },
  "form.notes":               { en: "Notes",                ar: "ملاحظات" },
  "form.type":                { en: "Type",                 ar: "النوع" },
  "form.size":                { en: "Size",                 ar: "الحجم" },
  "form.color":               { en: "Color",                ar: "اللون" },
  "form.brand":               { en: "Brand",                ar: "العلامة التجارية" },
  "form.category":            { en: "Category",             ar: "الفئة" },
  "form.country":             { en: "Country",              ar: "البلد" },
  "form.lead_time_days":      { en: "Lead Time (Days)",     ar: "وقت التنفيذ (أيام)" },
  "form.estimated_date":      { en: "Estimated Date",       ar: "التاريخ المتوقع" },
  "form.needs_packing":       { en: "Needs Packing",        ar: "يحتاج تعبئة" },
  "form.is_active":           { en: "Is Active",            ar: "نشط" },
  "form.image_url":           { en: "Image URL",            ar: "رابط الصورة" },
  "form.upload_image":        { en: "Upload Image",         ar: "رفع صورة" },
  "form.machine_type":        { en: "Machine Type",         ar: "نوع الماكينة" },

  // ══════════════════════════════════════════
  //  TOAST MESSAGES
  // ══════════════════════════════════════════
  "toast.success":            { en: "Success",              ar: "نجاح" },
  "toast.error":              { en: "Error",                ar: "خطأ" },
  "toast.warning":            { en: "Warning",              ar: "تحذير" },
  "toast.info":               { en: "Info",                 ar: "معلومة" },
  "toast.saved_successfully": { en: "Saved successfully",   ar: "تم الحفظ بنجاح" },
  "toast.updated_successfully":{en: "Updated successfully", ar: "تم التحديث بنجاح" },
  "toast.deleted_successfully":{en: "Deleted successfully", ar: "تم الحذف بنجاح" },
  "toast.created_successfully":{en: "Created successfully", ar: "تم الإنشاء بنجاح" },
  "toast.action_failed":      { en: "Action failed",        ar: "فشلت العملية" },
  "toast.invalid_input":      { en: "Invalid input",        ar: "إدخال غير صالح" },
  "toast.network_error":      { en: "Network error",        ar: "خطأ في الشبكة" },
  "toast.unauthorized":       { en: "Unauthorized",         ar: "غير مصرح" },
  "toast.not_found":          { en: "Not found",            ar: "غير موجود" },
  "toast.upload_failed":      { en: "Upload failed",        ar: "فشل الرفع" },
  "toast.upload_success":     { en: "Upload successful",    ar: "تم الرفع بنجاح" },

  // ══════════════════════════════════════════
  //  EMPTY STATES
  // ══════════════════════════════════════════
  "empty.no_data":            { en: "No data available",    ar: "لا توجد بيانات متاحة" },
  "empty.no_orders":          { en: "No orders found",      ar: "لم يتم العثور على طلبات" },
  "empty.no_products":        { en: "No products found",    ar: "لم يتم العثور على منتجات" },
  "empty.no_customers":       { en: "No customers found",   ar: "لم يتم العثور على عملاء" },
  "empty.no_machines":        { en: "No machines found",    ar: "لم يتم العثور على ماكينات" },
  "empty.no_users":           { en: "No users found",       ar: "لم يتم العثور على مستخدمين" },
  "empty.no_boxes":           { en: "No boxes found",       ar: "لم يتم العثور على صناديق" },
  "empty.no_results":         { en: "No results match your search", ar: "لا توجد نتائج تطابق بحثك" },
  "empty.select_item":        { en: "Select an item to view details", ar: "حدد عنصراً لعرض التفاصيل" },

  // ══════════════════════════════════════════
  //  DATE LABELS
  // ══════════════════════════════════════════
  "date.today":               { en: "Today",                ar: "اليوم" },
  "date.yesterday":           { en: "Yesterday",            ar: "أمس" },
  "date.tomorrow":            { en: "Tomorrow",             ar: "غداً" },
  "date.this_week":           { en: "This Week",            ar: "هذا الأسبوع" },
  "date.last_week":           { en: "Last Week",            ar: "الأسبوع الماضي" },
  "date.this_month":          { en: "This Month",           ar: "هذا الشهر" },
  "date.last_month":          { en: "Last Month",           ar: "الشهر الماضي" },
  "date.this_year":           { en: "This Year",            ar: "هذا العام" },
  "date.custom_range":        { en: "Custom Range",         ar: "نطاق مخصص" },
  "date.start_date":          { en: "Start Date",           ar: "تاريخ البدء" },
  "date.end_date":            { en: "End Date",             ar: "تاريخ الانتهاء" },

  // ══════════════════════════════════════════
  //  DIALOG TITLES
  // ══════════════════════════════════════════
  "dialog.confirm_delete":    { en: "Confirm Deletion",     ar: "تأكيد الحذف" },
  "dialog.are_you_sure":      { en: "Are you sure?",        ar: "هل أنت متأكد؟" },
  "dialog.cannot_undo":       { en: "This action cannot be undone.", ar: "لا يمكن التراجع عن هذا الإجراء." },
  "dialog.assign_box":        { en: "Assign Box",           ar: "تعيين صندوق" },
  "dialog.assign_machine":    { en: "Assign Machine",       ar: "تعيين ماكينة" },
  "dialog.update_status":     { en: "Update Status",        ar: "تحديث الحالة" },
  "dialog.add_notes":         { en: "Add Notes",            ar: "إضافة ملاحظات" },
  "dialog.view_details":      { en: "View Details",         ar: "عرض التفاصيل" },
  "dialog.print_label":       { en: "Print Label",          ar: "طباعة ملصق" },
  "dialog.scan_barcode":      { en: "Scan Barcode",         ar: "مسح الباركود" },

  // ══════════════════════════════════════════
  //  QUEUE ACTIONS
  // ══════════════════════════════════════════
  "queue.start_batch":        { en: "Start Batch",          ar: "بدء الدفعة" },
  "queue.finish_batch":       { en: "Finish Batch",         ar: "إنهاء الدفعة" },
  "queue.move_next":          { en: "Move to Next Phase",   ar: "الانتقال للمرحلة التالية" },
  "queue.mark_ready":         { en: "Mark as Ready",        ar: "تحديد كجاهز" },
  "queue.pause":              { en: "Pause",                ar: "إيقاف مؤقت" },
  "queue.resume":             { en: "Resume",               ar: "استئناف" },
  "queue.qc_pass":            { en: "QC Pass",              ar: "اجتياز الفحص" },
  "queue.qc_fail":            { en: "QC Fail",              ar: "فشل الفحص" },
  "queue.assign":             { en: "Assign",               ar: "تعيين" },
  "queue.unassign":           { en: "Unassign",             ar: "إلغاء التعيين" },

  // ══════════════════════════════════════════
  //  VARIOUS EXTRAS
  // ══════════════════════════════════════════
  "extra.print_guide":        { en: "Print Guide",          ar: "طباعة الدليل" },
  "extra.add_to_order":       { en: "Add to Order",         ar: "إضافة للطلب" },
  "extra.search_boxes":       { en: "Search Boxes",         ar: "البحث في الصناديق" },
  "extra.move_directly":      { en: "Move Directly",        ar: "نقل مباشر" },
  "extra.assign_to_box":      { en: "Assign to Box",        ar: "تعيين إلى صندوق" },

  "catalog.duplicate":        { en: "Duplicate",            ar: "تكرار" },
  "catalog.manage_brands":    { en: "Manage Brands",        ar: "إدارة العلامات التجارية" },
  "catalog.manage_categories":{ en: "Manage Categories",    ar: "إدارة الفئات" },
  "catalog.download_template":{ en: "Download Template",    ar: "تحميل النموذج" },

  "order.packaging_reference":{ en: "Packaging Reference",  ar: "مرجع التعبئة" },
  "order.raw_material_images":{ en: "Raw Material Images",  ar: "صور المواد الخام" },
  "order.create_kartona":     { en: "Create Kartona",       ar: "إنشاء كرتونة" },
  "order.add_item":           { en: "Add Item",             ar: "إضافة عنصر" },
  "order.remove_item":        { en: "Remove Item",          ar: "إزالة عنصر" },
};
