// Payment reminder text, in the language the customer ordered in.
// chat = short line shown inside the shop chat (a PayPal button sits under it).
// full = message with the PayPal link, ready to send on any channel.
const R = {
  en: (n, id, amt, shop) => [`Hi ${n}! Friendly reminder from ${shop}: your order ${id} (${amt}) is still waiting for payment. You can pay below with PayPal.`, `Hi ${n}! Friendly reminder from ${shop}: your order ${id} (${amt}) is still waiting for payment. Pay securely with PayPal here:`],
  es: (n, id, amt, shop) => [`¡Hola ${n}! Un recordatorio de ${shop}: tu pedido ${id} (${amt}) sigue pendiente de pago. Puedes pagar abajo con PayPal.`, `¡Hola ${n}! Un recordatorio de ${shop}: tu pedido ${id} (${amt}) sigue pendiente de pago. Paga de forma segura con PayPal aquí:`],
  pt: (n, id, amt, shop) => [`Oi ${n}! Um lembrete da ${shop}: seu pedido ${id} (${amt}) ainda está aguardando pagamento. Você pode pagar abaixo com PayPal.`, `Oi ${n}! Um lembrete da ${shop}: seu pedido ${id} (${amt}) ainda está aguardando pagamento. Pague com segurança pelo PayPal aqui:`],
  fr: (n, id, amt, shop) => [`Bonjour ${n} ! Petit rappel de ${shop} : votre commande ${id} (${amt}) attend toujours le paiement. Vous pouvez payer ci-dessous avec PayPal.`, `Bonjour ${n} ! Petit rappel de ${shop} : votre commande ${id} (${amt}) attend toujours le paiement. Payez en toute sécurité avec PayPal ici :`],
  id: (n, id, amt, shop) => [`Halo kak ${n}! Pengingat dari ${shop}: pesanan ${id} (${amt}) masih menunggu pembayaran. Bisa bayar lewat tombol PayPal di bawah ya.`, `Halo kak ${n}! Pengingat dari ${shop}: pesanan ${id} (${amt}) masih menunggu pembayaran. Bayar aman lewat PayPal di sini:`],
  zh: (n, id, amt, shop) => [`${n} 你好！${shop} 温馨提醒：你的订单 ${id}（${amt}）还在等待付款，可以用下方的 PayPal 按钮付款。`, `${n} 你好！${shop} 温馨提醒：你的订单 ${id}（${amt}）还在等待付款，可通过 PayPal 安全付款：`],
  ja: (n, id, amt, shop) => [`${n}さん、こんにちは！${shop}からのお知らせです。ご注文 ${id}（${amt}）のお支払いがまだです。下の PayPal ボタンからお支払いいただけます。`, `${n}さん、こんにちは！${shop}からのお知らせです。ご注文 ${id}（${amt}）のお支払いがまだです。こちらから PayPal で安全にお支払いいただけます：`],
  hi: (n, id, amt, shop) => [`नमस्ते ${n}! ${shop} की ओर से याद दिलाना: आपका ऑर्डर ${id} (${amt}) अभी भुगतान का इंतज़ार कर रहा है। नीचे PayPal से भुगतान कर सकते हैं।`, `नमस्ते ${n}! ${shop} की ओर से याद दिलाना: आपका ऑर्डर ${id} (${amt}) अभी भुगतान का इंतज़ार कर रहा है। यहाँ PayPal से सुरक्षित भुगतान करें:`],
};

export function reminderText(lang, order, shop, link) {
  const [chat, full] = (R[lang] || R.en)(order.customer, order.id, `$${order.total.toFixed(2)}`, shop);
  return { chat, full: link ? `${full} ${link}` : full };
}
