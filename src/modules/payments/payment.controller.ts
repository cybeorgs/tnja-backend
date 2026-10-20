import type { Request, Response } from "express";
import { registrationTypeFromRole } from "./applicant.js";
import { PaymentError, createRegistrationOrder, verifyCheckoutPayment } from "./payment.service.js";

/**
 * The applicant is always the logged-in account: ids in the request body are
 * ignored so nobody can pay for, or claim the ID of, another application.
 */
function currentApplicant(req: Request) {
  const { userId, role } = (req as any).user ?? {};
  const type = registrationTypeFromRole(role);
  if (!type || typeof userId !== "string") {
    throw new PaymentError(403, "Only registered players, coaches, members and clubs can pay a registration fee.");
  }
  return { type, id: userId };
}

function sendError(res: Response, scope: string, error: unknown) {
  if (error instanceof PaymentError) return res.status(error.status).json({ error: error.message });
  console.error(`[${scope}]`, (error as any)?.error?.description || error);
  return res.status(500).json({ error: "Payment could not be processed. Please try again." });
}

// POST /api/application/create-order
export const createPaymentOrder = async (req: Request, res: Response) => {
  try {
    const applicant = currentApplicant(req);
    return res.json(await createRegistrationOrder(applicant.type, applicant.id));
  } catch (error) {
    return sendError(res, "createPaymentOrder", error);
  }
};

// POST /api/application/verify-payment
export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const applicant = currentApplicant(req);
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body ?? {};
    const result = await verifyCheckoutPayment(applicant.type, applicant.id, {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    return res.json(result);
  } catch (error) {
    return sendError(res, "verifyPayment", error);
  }
};
