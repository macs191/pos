import { trpc } from "@/lib/trpc";
import {
  BarChart3,
  Boxes,
  Building2,
  Check,
  CreditCard,
  Edit3,
  Filter,
  Loader2,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const money = (value: number | string | null | undefined) =>
  `${Number(value ?? 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

export function SuperAdminPanel() {
  const overview = trpc.superAdmin.overview.useQuery(undefined, {
    retry: false,
  });
  const accounts = trpc.superAdmin.accounts.useQuery(undefined, {
    retry: false,
  });
  const users = trpc.superAdmin.users.useQuery(undefined, { retry: false });
  const products = trpc.superAdmin.products.useQuery(undefined, {
    retry: false,
  });
  const requests = trpc.superAdmin.priceChangeRequests.useQuery(undefined, {
    retry: false,
  });
  const subscriptionRequests = trpc.superAdmin.subscriptionRequests.useQuery(
    undefined,
    { retry: false }
  );
  const [editingBarcode, setEditingBarcode] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [requestDays, setRequestDays] = useState(30);
  const [accountSearch, setAccountSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState<"ALL" | "PAID" | "UNPAID" | "ACTIVE" | "INACTIVE">("ALL");
  const [productSearch, setProductSearch] = useState("");
  const [productVisibility, setProductVisibility] = useState<"ALL" | "VISIBLE" | "HIDDEN">("ALL");
  const [priceSearch, setPriceSearch] = useState("");
  const [priceFilter, setPriceFilter] = useState("ALL");
  const [subscriptionSearch, setSubscriptionSearch] = useState("");
  const [subscriptionFilter, setSubscriptionFilter] = useState("ALL");
  const [userSearch, setUserSearch] = useState("");

  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLocaleLowerCase();
    return (accounts.data ?? []).filter(Boolean).filter(({ store, access }: any) => {
      const matchesText = !query || `${store.name ?? ""} ${store.id ?? ""} ${store.phone ?? ""}`.toLocaleLowerCase().includes(query);
      const matchesFilter = accountFilter === "ALL" ||
        (accountFilter === "PAID" && access?.isPaid === true) ||
        (accountFilter === "UNPAID" && access?.isPaid !== true) ||
        (accountFilter === "ACTIVE" && access?.isActive === true) ||
        (accountFilter === "INACTIVE" && access?.isActive !== true);
      return matchesText && matchesFilter;
    });
  }, [accounts.data, accountFilter, accountSearch]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase();
    return (products.data ?? []).filter(Boolean).filter((product: any) => {
      const matchesText = !query || `${product.name ?? ""} ${product.barcode ?? ""}`.toLocaleLowerCase().includes(query);
      const matchesVisibility = productVisibility === "ALL" ||
        (productVisibility === "HIDDEN" ? product.isActive === false : product.isActive !== false);
      return matchesText && matchesVisibility;
    });
  }, [products.data, productSearch, productVisibility]);

  const filteredPriceRequests = useMemo(() => {
    const query = priceSearch.trim().toLocaleLowerCase();
    return (requests.data ?? []).filter(Boolean)
      .filter((request: any) => (priceFilter === "ALL" || request.status === priceFilter) &&
        (!query || `${request.productName ?? ""} ${request.barcode ?? ""} ${request.requestedByStoreName ?? ""} ${request.requestedByName ?? ""}`.toLocaleLowerCase().includes(query)))
      .sort((a: any, b: any) => {
        const rank = (status: string) => status === "PENDING" ? 0 : status === "PROCESSING" ? 1 : 2;
        return rank(a.status) - rank(b.status) || String(b.createdAt).localeCompare(String(a.createdAt));
      });
  }, [requests.data, priceFilter, priceSearch]);

  const filteredSubscriptionRequests = useMemo(() => {
    const query = subscriptionSearch.trim().toLocaleLowerCase();
    return (subscriptionRequests.data ?? []).filter(Boolean)
      .filter((request: any) => (subscriptionFilter === "ALL" || request.status === subscriptionFilter) &&
        (!query || `${request.storeName ?? ""} ${request.supermarketId ?? ""} ${request.requestedByName ?? ""} ${request.requestedByEmail ?? ""}`.toLocaleLowerCase().includes(query)))
      .sort((a: any, b: any) => {
        const rank = (status: string) => status === "PENDING" ? 0 : status === "PROCESSING" ? 1 : 2;
        return rank(a.status) - rank(b.status) || String(b.createdAt).localeCompare(String(a.createdAt));
      });
  }, [subscriptionRequests.data, subscriptionFilter, subscriptionSearch]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLocaleLowerCase();
    return (users.data ?? []).filter(Boolean).filter((user: any) =>
      !query || `${user.name ?? ""} ${user.email ?? ""} ${user.supermarketId ?? ""} ${user.role ?? ""}`.toLocaleLowerCase().includes(query)
    );
  }, [users.data, userSearch]);

  const refreshCatalog = () => {
    void products.refetch();
    void requests.refetch();
    void overview.refetch();
  };
  const setRole = trpc.superAdmin.setUserRole.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث صلاحية المستخدم");
      void users.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const setActive = trpc.superAdmin.setUserActive.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث حالة المستخدم");
      void users.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const setSubscription = trpc.superAdmin.setSubscription.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث الاشتراك");
      void accounts.refetch();
      void overview.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const resolveSubscriptionRequest =
    trpc.superAdmin.resolveSubscriptionRequest.useMutation({
      onSuccess: result => {
        toast.success(
          result.status === "APPROVED"
            ? "تم تفعيل الاشتراك، وحالة الدفع غير مدفوعة حتى تأكيدها يدويًا"
            : "تم رفض طلب الاشتراك"
        );
        void subscriptionRequests.refetch();
        void accounts.refetch();
        void overview.refetch();
      },
      onError: error => toast.error(error.message),
    });
  const updateProduct = trpc.superAdmin.updateProduct.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث المنتج العام");
      setEditingBarcode(null);
      refreshCatalog();
    },
    onError: error => toast.error(error.message),
  });
  const setProductActive = trpc.superAdmin.setProductActive.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث ظهور المنتج");
      refreshCatalog();
    },
    onError: error => toast.error(error.message),
  });
  const resolvePrice = trpc.superAdmin.resolvePriceChange.useMutation({
    onSuccess: result => {
      toast.success(
        result.status === "APPROVED"
          ? "تم اعتماد السعر وتحديثه لجميع المتاجر"
          : "تم رفض طلب تغيير السعر"
      );
      refreshCatalog();
    },
    onError: error => toast.error(error.message),
  });

  const cards = [
    {
      label: "المتاجر",
      value: overview.data?.supermarkets,
      icon: <Building2 size={18} />,
      filter: null,
    },
    {
      label: "المستخدمون",
      value: overview.data?.users,
      icon: <Users size={18} />,
      filter: null,
    },
    {
      label: "المنتجات المشتركة",
      value: overview.data?.products,
      icon: <Boxes size={18} />,
      filter: null,
    },
    {
      label: "إجمالي المبيعات",
      value: money(overview.data?.sales),
      icon: <BarChart3 size={18} />,
      filter: null,
    },
    {
      label: "اشتراكات مدفوعة",
      value: overview.data?.paidSubscriptions,
      icon: <CreditCard size={18} />,
      filter: "PAID" as const,
    },
    {
      label: "اشتراكات غير مدفوعة",
      value: overview.data?.unpaidSubscriptions,
      icon: <CreditCard size={18} />,
      filter: "UNPAID" as const,
    },
    {
      label: "طلبات سعر معلقة",
      value: overview.data?.pendingPriceRequests,
      icon: <Edit3 size={18} />,
      filter: null,
    },
  ];

  const startEdit = (product: any) => {
    setEditingBarcode(product.barcode);
    setEditName(product.name);
    setEditPrice(String(product.sellingPrice));
  };

  const saveProduct = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingBarcode) return;
    const sellingPrice = Number(editPrice);
    if (
      !editName.trim() ||
      !Number.isFinite(sellingPrice) ||
      sellingPrice < 0
    ) {
      toast.error("أدخل اسمًا وسعرًا صالحين.");
      return;
    }
    updateProduct.mutate({
      barcode: editingBarcode,
      name: editName.trim(),
      sellingPrice,
    });
  };

  const paymentToggle = (storeId: number, access: any) =>
    setSubscription.mutate({
      supermarketId: storeId,
      status: access?.subscription?.status ?? "ACTIVE",
      endDate: access?.effectiveEnd
        ? new Date(access.effectiveEnd)
        : new Date(Date.now() + 15 * 86400000),
      isPaid: !access?.isPaid,
    });

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-[#071723] p-6 text-white">
        <div className="flex items-center gap-2 text-xs font-bold text-[#b8efdc]">
          <ShieldCheck size={15} /> منصة الإدارة العليا
        </div>
        <h2 className="mt-2 text-2xl font-extrabold">مركز التحكم الكامل</h2>
        <p className="mt-1 text-xs text-[#94afb1]">
          إدارة الكتالوج والأسعار والاشتراكات وحسابات جميع المتاجر.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(card => (
          <button
            type="button"
            key={card.label}
            disabled={!card.filter}
            onClick={() => card.filter && setAccountFilter(card.filter)}
            aria-pressed={card.filter ? accountFilter === card.filter : undefined}
            className={`soft-shadow rounded-2xl border border-[#e0e9e6] bg-white p-4 text-right transition ${card.filter ? "cursor-pointer hover:border-[#82c6b0] hover:bg-[#fbfefd]" : "cursor-default"} ${card.filter && accountFilter === card.filter ? "ring-2 ring-[#0f6e58]/30" : ""}`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8f4f0] text-[#267a60]">
              {card.icon}
            </div>
            <div className="mt-3 text-xl font-extrabold text-[#29464e]">
              {card.value ?? "—"}
            </div>
            <div className="mt-1 text-[11px] font-semibold text-[#73888a]">
              {card.label}
            </div>
            {card.filter && <div className="mt-2 text-[10px] font-bold text-[#287e64]">اضغط لتصفية المتاجر</div>}
          </button>
        ))}
      </div>

      <section className="soft-shadow overflow-hidden rounded-2xl border border-[#e0e9e6] bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-extrabold text-[#29464e]">
              طلبات تغيير الأسعار
            </h3>
            <p className="mt-1 text-[11px] text-[#8a9c9c]">
              لا يسري أي سعر مقترح قبل موافقتك
            </p>
          </div>
          <span className="rounded-full bg-[#fff3cf] px-3 py-1 text-[10px] font-bold text-[#8b6500]">
            {requests.data?.filter(request => request.status === "PENDING")
              .length ?? 0}{" "}
            معلّق
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="relative min-w-56 flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[#93a3a3]" size={15} />
            <input value={priceSearch} onChange={event => setPriceSearch(event.target.value)} placeholder="ابحث بالمنتج أو الباركود أو المتجر أو المستخدم" className="w-full rounded-xl border border-[#dfe9e5] bg-[#f8fbfa] py-2.5 pr-9 pl-3 text-xs outline-none focus:border-[#77bca8]" />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-[#dfe9e5] bg-white px-3 py-2 text-[10px] font-bold text-[#718688]">
            <Filter size={14} />
            <select aria-label="تصفية طلبات تغيير الأسعار حسب الحالة" value={priceFilter} onChange={event => setPriceFilter(event.target.value)} className="bg-transparent outline-none">
              <option value="ALL">كل الحالات</option><option value="PENDING">قيد المراجعة</option><option value="PROCESSING">جارٍ المعالجة</option><option value="APPROVED">مقبول</option><option value="REJECTED">مرفوض</option>
            </select>
          </label>
          <span className="text-[10px] text-[#829394]">{filteredPriceRequests.length} طلب</span>
        </div>
        {requests.isLoading ? (
          <div className="p-8 text-center text-xs text-[#829394]">
            جارٍ تحميل الطلبات...
          </div>
        ) : filteredPriceRequests.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#f8fbfa] text-[10px] font-extrabold text-[#88999a]">
                <tr>
                  <th className="px-3 py-3">المنتج والباركود</th>
                  <th className="px-3 py-3">المتجر / المستخدم</th>
                  <th className="px-3 py-3">السعر الحالي</th>
                  <th className="px-3 py-3">المقترح</th>
                  <th className="px-3 py-3">الحالة</th>
                  <th className="px-3 py-3">قرار المدير</th>
                </tr>
              </thead>
              <tbody>
                {filteredPriceRequests.map((request: any) => (
                  <tr key={request.id} className="border-t border-[#eef3f1]">
                    <td className="px-3 py-3">
                      <div className="font-extrabold text-[#34515a]">
                        {request.productName}
                      </div>
                      <div className="mono mt-1 text-[10px] text-[#819293]">
                        {request.barcode}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-[#526c70]">
                        {request.requestedByStoreName}
                      </div>
                      <div className="mt-1 text-[10px] text-[#899b9b]">
                        {request.requestedByName}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-bold text-[#526c70]">
                      {money(request.currentPrice)}
                    </td>
                    <td className="px-3 py-3 font-extrabold text-[#0f6e58]">
                      {money(request.requestedPrice)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-bold ${request.status === "PENDING" || request.status === "PROCESSING" ? "bg-[#fff3cf] text-[#8b6500]" : request.status === "APPROVED" ? "bg-[#e7f6f0] text-[#2a8064]" : "bg-[#fce8e7] text-[#a83d42]"}`}
                      >
                        {request.status === "PENDING"
                          ? "قيد المراجعة"
                          : request.status === "PROCESSING"
                            ? "جارٍ المعالجة"
                          : request.status === "APPROVED"
                            ? "مقبول"
                            : "مرفوض"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {request.status === "PENDING" ? (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            disabled={resolvePrice.isPending}
                            onClick={() =>
                              resolvePrice.mutate({
                                requestId: request.id,
                                decision: "APPROVED",
                              })
                            }
                            className="rounded-lg bg-[#0f5d4d] px-2 py-1.5 text-[10px] font-bold text-white"
                          >
                            موافقة
                          </button>
                          <button
                            type="button"
                            disabled={resolvePrice.isPending}
                            onClick={() =>
                              resolvePrice.mutate({
                                requestId: request.id,
                                decision: "REJECTED",
                              })
                            }
                            className="rounded-lg border border-[#f0d8d8] px-2 py-1.5 text-[10px] font-bold text-[#a83d42]"
                          >
                            رفض
                          </button>
                        </div>
                      ) : request.status === "PROCESSING" ? (
                        <span className="text-[10px] font-bold text-[#8b6500]">جارٍ حفظ قرار المدير…</span>
                      ) : (
                        <span className="text-[10px] text-[#899b9b]">
                          <span className="block font-bold">{request.status === "APPROVED" ? "اعتماد" : "رفض"}</span>
                          <span className="mt-1 block">{request.reviewedAt ? new Date(request.reviewedAt).toLocaleString("ar-EG") : "وقت القرار غير متوفر"}</span>
                          {request.reviewedByUserId ? <span className="mt-1 block">المدير #{request.reviewedByUserId}</span> : null}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-xs text-[#829394]">
            لا توجد طلبات مطابقة لهذا البحث أو الفلتر.
          </div>
        )}
      </section>

      <section className="soft-shadow overflow-hidden rounded-2xl border border-[#e0e9e6] bg-white p-5">
        <div>
          <h3 className="font-extrabold text-[#29464e]">
            إدارة الكتالوج العام
          </h3>
          <p className="mt-1 text-[11px] text-[#8a9c9c]">
            تعديل اسم أو سعر المنتج وإخفاءه عن المسح لجميع المتاجر
          </p>
        </div>
        {editingBarcode && (
          <form
            onSubmit={saveProduct}
            className="mt-4 grid gap-3 rounded-xl border border-[#dce9e4] bg-[#f8fbfa] p-3 md:grid-cols-[1fr_1fr_auto_auto]"
          >
            <div>
              <div className="mb-1 text-[10px] font-bold text-[#829394]">
                الباركود
              </div>
              <div className="mono rounded-lg bg-white px-3 py-2 text-xs">
                {editingBarcode}
              </div>
            </div>
            <label className="text-[10px] font-bold text-[#597175]">
              اسم المنتج
              <input
                required
                value={editName}
                onChange={event => setEditName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[#dfe9e5] bg-white px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] font-bold text-[#597175]">
              السعر
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={editPrice}
                onChange={event => setEditPrice(event.target.value)}
                className="mt-1 w-32 rounded-lg border border-[#dfe9e5] bg-white px-3 py-2 text-xs"
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                disabled={updateProduct.isPending}
                className="flex items-center gap-1 rounded-lg bg-[#0f5d4d] px-3 py-2 text-[10px] font-bold text-white"
              >
                {updateProduct.isPending ? (
                  <Loader2 className="animate-spin" size={13} />
                ) : (
                  <Check size={13} />
                )}{" "}
                حفظ
              </button>
              <button
                type="button"
                onClick={() => setEditingBarcode(null)}
                className="rounded-lg border border-[#dfe9e5] px-3 py-2 text-[10px] font-bold text-[#526c70]"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="relative min-w-56 flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[#93a3a3]" size={15} />
            <input value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="ابحث باسم المنتج أو الباركود" className="w-full rounded-xl border border-[#dfe9e5] bg-[#f8fbfa] py-2.5 pr-9 pl-3 text-xs outline-none focus:border-[#77bca8]" />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-[#dfe9e5] bg-white px-3 py-2 text-[10px] font-bold text-[#718688]">
            <Filter size={14} />
            <select aria-label="تصفية المنتجات حسب الظهور" value={productVisibility} onChange={event => setProductVisibility(event.target.value as "ALL" | "VISIBLE" | "HIDDEN")} className="bg-transparent outline-none">
              <option value="ALL">كل المنتجات</option><option value="VISIBLE">الظاهرة</option><option value="HIDDEN">المخفية</option>
            </select>
          </label>
          <span className="text-[10px] text-[#829394]">{filteredProducts.length} منتج</span>
        </div>
        {products.isLoading ? (
          <div className="p-8 text-center text-xs text-[#829394]">
            جارٍ تحميل المنتجات...
          </div>
        ) : filteredProducts.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#f8fbfa] text-[10px] font-extrabold text-[#88999a]">
                <tr>
                  <th className="px-3 py-3">المنتج</th>
                  <th className="px-3 py-3">الباركود</th>
                  <th className="px-3 py-3">السعر</th>
                  <th className="px-3 py-3">الظهور</th>
                  <th className="px-3 py-3">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product: any) => (
                  <tr key={product.id} className="border-t border-[#eef3f1]">
                    <td className="px-3 py-3 font-extrabold text-[#34515a]">
                      {product.name}
                    </td>
                    <td className="mono px-3 py-3 text-[#819293]">
                      {product.barcode}
                    </td>
                    <td className="px-3 py-3 font-bold text-[#29464e]">
                      {money(product.sellingPrice)}
                    </td>
                    <td className="px-3 py-3">
                      {product.isActive === false ? (
                        <span className="text-[#a83d42]">مخفي</span>
                      ) : (
                        <span className="text-[#2a8064]">ظاهر</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(product)}
                          className="rounded-lg border border-[#dfe9e5] px-2 py-1 text-[10px] font-bold text-[#526c70]"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setProductActive.mutate({
                              barcode: product.barcode,
                              isActive: product.isActive === false,
                            })
                          }
                          className="rounded-lg bg-[#f3f7f5] px-2 py-1 text-[10px] font-bold text-[#526c70]"
                        >
                          {product.isActive === false ? "إظهار" : "إخفاء"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-[#829394]">
            لا توجد منتجات مطابقة لهذا البحث أو الفلتر.
          </div>
        )}
      </section>

      <section className="soft-shadow overflow-hidden rounded-2xl border border-[#e0e9e6] bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-extrabold text-[#29464e]">اشتراكات المتاجر</h3>
            <p className="mt-1 text-[11px] text-[#8a9c9c]">
              إدارة الوصول والمدة مستقلة عن تأكيد الدفع اليدوي
            </p>
          </div>
          <span className="rounded-full bg-[#e8f4f0] px-3 py-1 text-[10px] font-bold text-[#267a60]">
            تجربة أولية 15 يومًا
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="relative min-w-56 flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[#93a3a3]" size={15} />
            <input value={accountSearch} onChange={event => setAccountSearch(event.target.value)} placeholder="ابحث باسم المتجر أو رقمه أو هاتفه" className="w-full rounded-xl border border-[#dfe9e5] bg-[#f8fbfa] py-2.5 pr-9 pl-3 text-xs outline-none focus:border-[#77bca8]" />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-[#dfe9e5] bg-white px-3 py-2 text-[10px] font-bold text-[#718688]">
            <Filter size={14} />
            <select aria-label="تصفية المتاجر حسب الدفع أو صلاحية الاشتراك" value={accountFilter} onChange={event => setAccountFilter(event.target.value as typeof accountFilter)} className="bg-transparent outline-none">
              <option value="ALL">كل المتاجر</option><option value="PAID">مدفوع</option><option value="UNPAID">غير مدفوع</option><option value="ACTIVE">وصول نشط</option><option value="INACTIVE">وصول غير نشط</option>
            </select>
          </label>
          <span className="text-[10px] text-[#829394]">{filteredAccounts.length} متجر</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#f8fbfa] text-[10px] font-extrabold text-[#88999a]">
              <tr>
                <th className="px-3 py-3">المتجر</th>
                <th className="px-3 py-3">حالة الوصول</th>
                <th className="px-3 py-3">تأكيد الدفع</th>
                <th className="px-3 py-3">ينتهي في</th>
                <th className="px-3 py-3">إدارة الاشتراك</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-xs text-[#829394]">لا توجد متاجر مطابقة لهذا البحث أو الفلتر.</td></tr>
              ) : filteredAccounts.map(({ store, access }: any) => (
                <tr key={store.id} className="border-t border-[#eef3f1]">
                  <td className="px-3 py-3 font-extrabold text-[#34515a]">
                    {store.name}
                  </td>
                  <td className="px-3 py-3">
                    {access?.isActive ? (
                      <span className="rounded-full bg-[#e7f6f0] px-2 py-1 text-[10px] font-bold text-[#2a8064]">
                        نشط
                      </span>
                    ) : (
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${access?.subscription?.status === "PAUSED" ? "bg-[#fff3cf] text-[#8b6500]" : "bg-[#fce8e7] text-[#a83d42]"}`}>
                        {access?.subscription?.status === "PAUSED" ? "موقوف" : access?.subscription ? "منتهي" : "غير مفعّل"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold ${access?.isPaid ? "bg-[#e7f6f0] text-[#2a8064]" : "bg-[#fff3cf] text-[#8b6500]"}`}
                    >
                      {access?.isPaid ? "مدفوع" : "غير مدفوع"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[#76888a]">
                    {access?.effectiveEnd
                      ? new Date(access.effectiveEnd).toLocaleDateString(
                          "ar-EG"
                        )
                      : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setSubscription.mutate({
                            supermarketId: store.id,
                            status: "ACTIVE",
                            endDate: new Date(
                              Math.max(
                                Date.now(),
                                access?.effectiveEnd
                                  ? new Date(access.effectiveEnd).getTime()
                                  : 0
                              ) +
                                30 * 86400000
                            ),
                          })
                        }
                        className="rounded-lg bg-[#e7f5f0] px-2 py-1.5 text-[10px] font-bold text-[#267a60]"
                      >
                        تمديد 30 يومًا
                      </button>
                      <button
                        type="button"
                        onClick={() => paymentToggle(store.id, access)}
                        className="rounded-lg border border-[#dfe9e5] px-2 py-1.5 text-[10px] font-bold text-[#526c70]"
                      >
                        تحديد كـ{access?.isPaid ? "غير مدفوع" : "مدفوع"}
                      </button>
                      <button
                        type="button"
                        disabled={!access?.isActive && !(access?.subscription?.status === "PAUSED" && access?.effectiveEnd && new Date(access.effectiveEnd).getTime() > Date.now())}
                        onClick={() =>
                          setSubscription.mutate({
                            supermarketId: store.id,
                            status:
                              access?.subscription?.status === "PAUSED"
                                ? "ACTIVE"
                                : "PAUSED",
                            endDate: access?.effectiveEnd
                              ? new Date(access.effectiveEnd)
                              : null,
                          })
                        }
                        className="rounded-lg border border-[#f0d8d8] px-2 py-1.5 text-[10px] font-bold text-[#a83d42] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                      {access?.subscription?.status === "PAUSED"
                        ? "تفعيل"
                          : access?.isActive ? "إيقاف مؤقت" : "انتهى — استخدم التمديد"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="soft-shadow overflow-hidden rounded-2xl border border-[#e0e9e6] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-[#29464e]">طلبات الاشتراك</h3>
            <p className="mt-1 text-[11px] text-[#8a9c9c]">
              الطلبات الواردة من المتاجر؛ الموافقة تفعّل المدة كغير مدفوعة،
              ويمكن تسجيل الدفع يدويًا من جدول الاشتراكات.
            </p>
          </div>
          <label className="text-[10px] font-bold text-[#718688]">
            مدة التمديد بالأيام
            <input
              type="number"
              min={1}
              max={365}
              value={requestDays}
              onChange={event =>
                setRequestDays(
                  Math.max(1, Math.min(365, Number(event.target.value) || 1))
                )
              }
              className="mt-1 block w-24 rounded-lg border border-[#dfe9e5] bg-white px-2 py-1.5 text-xs font-bold text-[#29464e]"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="relative min-w-56 flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[#93a3a3]" size={15} />
            <input value={subscriptionSearch} onChange={event => setSubscriptionSearch(event.target.value)} placeholder="ابحث بالمتجر أو مقدم الطلب أو البريد" className="w-full rounded-xl border border-[#dfe9e5] bg-[#f8fbfa] py-2.5 pr-9 pl-3 text-xs outline-none focus:border-[#77bca8]" />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-[#dfe9e5] bg-white px-3 py-2 text-[10px] font-bold text-[#718688]">
            <Filter size={14} />
            <select aria-label="تصفية طلبات الاشتراك حسب الحالة" value={subscriptionFilter} onChange={event => setSubscriptionFilter(event.target.value)} className="bg-transparent outline-none">
              <option value="ALL">كل الحالات</option><option value="PENDING">قيد المراجعة</option><option value="PROCESSING">جارٍ المعالجة</option><option value="APPROVED">تمت الموافقة</option><option value="REJECTED">مرفوض</option>
            </select>
          </label>
          <span className="text-[10px] text-[#829394]">{filteredSubscriptionRequests.length} طلب</span>
        </div>
        {subscriptionRequests.isLoading ? (
          <div className="py-8 text-center text-xs text-[#829394]">
            جارٍ تحميل طلبات الاشتراك...
          </div>
        ) : filteredSubscriptionRequests.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#f8fbfa] text-[10px] font-extrabold text-[#88999a]">
                <tr>
                  <th className="px-3 py-3">المتجر</th>
                  <th className="px-3 py-3">مقدم الطلب</th>
                  <th className="px-3 py-3">تاريخ الطلب</th>
                  <th className="px-3 py-3">ملاحظة</th>
                  <th className="px-3 py-3">الحالة</th>
                  <th className="px-3 py-3">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubscriptionRequests.map((request: any) => (
                  <tr key={request.id} className="border-t border-[#eef3f1]">
                    <td className="px-3 py-3 font-extrabold text-[#34515a]">
                      {request.storeName || `متجر #${request.supermarketId}`}
                    </td>
                    <td className="px-3 py-3">
                      <div>{request.requestedByName || "مستخدم"}</div>
                      <div className="text-[10px] text-[#899b9b]">
                        {request.requestedByEmail || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[#76888a]">
                      {new Date(request.createdAt).toLocaleDateString("ar-EG")}
                    </td>
                    <td className="max-w-48 px-3 py-3 text-[#76888a]">
                      {request.note || "—"}
                    </td>
                    <td className="px-3 py-3">
                      {request.status === "PENDING"
                        ? "قيد المراجعة"
                        : request.status === "PROCESSING"
                          ? "جارٍ المعالجة"
                          : request.status === "APPROVED"
                            ? "تمت الموافقة"
                            : "مرفوض"}
                    </td>
                    <td className="px-3 py-3">
                      {request.status === "PENDING" ? (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={resolveSubscriptionRequest.isPending}
                            onClick={() =>
                              resolveSubscriptionRequest.mutate({
                                requestId: request.id,
                                decision: "APPROVED",
                                days: requestDays,
                              })
                            }
                            className="rounded-lg bg-[#e7f5f0] px-2 py-1.5 text-[10px] font-bold text-[#267a60] disabled:opacity-50"
                          >
                            موافقة + {requestDays} يومًا
                          </button>
                          <button
                            type="button"
                            disabled={resolveSubscriptionRequest.isPending}
                            onClick={() =>
                              resolveSubscriptionRequest.mutate({
                                requestId: request.id,
                                decision: "REJECTED",
                              })
                            }
                            className="rounded-lg border border-[#f0d8d8] px-2 py-1.5 text-[10px] font-bold text-[#a83d42] disabled:opacity-50"
                          >
                            رفض
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[#899b9b]">
                          {request.grantedDays
                            ? `تمديد ${request.grantedDays} يومًا`
                            : request.reviewedAt
                              ? `قرار ${new Date(request.reviewedAt).toLocaleDateString("ar-EG")}${request.reviewedByUserId ? ` · المدير #${request.reviewedByUserId}` : ""}`
                              : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-[#829394]">
            لا توجد طلبات اشتراك مطابقة لهذا البحث أو الفلتر.
          </div>
        )}
      </section>

      <section className="soft-shadow overflow-hidden rounded-2xl border border-[#e0e9e6] bg-white p-5">
        <div>
          <h3 className="font-extrabold text-[#29464e]">
            المستخدمون والصلاحيات
          </h3>
          <p className="mt-1 text-[11px] text-[#8a9c9c]">
            تعيين الدور أو تعطيل الحساب من لوحة المنصة
          </p>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <label className="relative min-w-56 flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[#93a3a3]" size={15} />
            <input value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="ابحث بالاسم أو البريد أو رقم المتجر أو الدور" className="w-full rounded-xl border border-[#dfe9e5] bg-[#f8fbfa] py-2.5 pr-9 pl-3 text-xs outline-none focus:border-[#77bca8]" />
          </label>
          <span className="text-[10px] text-[#829394]">{filteredUsers.length} مستخدم</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#f8fbfa] text-[10px] font-extrabold text-[#88999a]">
              <tr>
                <th className="px-3 py-3">المستخدم</th>
                <th className="px-3 py-3">المتجر</th>
                <th className="px-3 py-3">الدور</th>
                <th className="px-3 py-3">الحالة</th>
                <th className="px-3 py-3">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-xs text-[#829394]">لا يوجد مستخدم يطابق هذا البحث.</td></tr>
              ) : filteredUsers.map((user: any) => (
                <tr key={user.id} className="border-t border-[#eef3f1]">
                  <td className="px-3 py-3">
                    <div className="font-extrabold text-[#34515a]">
                      {user.name || "مستخدم"}
                    </div>
                    <div className="text-[10px] text-[#899b9b]">
                      {user.email || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[#76888a]">
                    #{user.supermarketId ?? "—"}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={user.role}
                      onChange={event =>
                        setRole.mutate({
                          userId: user.id,
                          role: event.target.value as
                            | "OWNER"
                            | "ADMIN"
                            | "MANAGER"
                            | "CASHIER"
                            | "SUPER_ADMIN",
                        })
                      }
                      className="rounded-lg border border-[#dfe9e5] bg-white px-2 py-1 text-[10px]"
                    >
                      <option value="OWNER">OWNER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="MANAGER">MANAGER</option>
                      <option value="CASHIER">CASHIER</option>
                      <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    {user.isActive ? "نشط" : "موقوف"}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        setActive.mutate({
                          userId: user.id,
                          isActive: !user.isActive,
                        })
                      }
                      className="rounded-lg border border-[#dfe9e5] px-2 py-1 text-[10px] font-bold text-[#526c70]"
                    >
                      {user.isActive ? "إيقاف" : "تفعيل"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
