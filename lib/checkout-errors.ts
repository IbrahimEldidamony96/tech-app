// خطأ مخصص لأي فشل متوقع جوه الـ checkout (مخزون، كوبون، إلخ) —
// بيترمي جوه الـ transaction فيسبب rollback تلقائي، وبعدين بيتلقط
// في الـ route ويتترجم لرسالة ورقم حالة واضحين، بدل ما يبقى 500 عام.
export class CheckoutError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
  }
}
