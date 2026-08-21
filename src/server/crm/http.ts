import { z } from "zod";

export const leadInputSchema=z.object({
  firstName:z.string().trim().min(1).max(100),lastName:z.string().trim().min(1).max(100),email:z.string().trim().email().max(320),company:z.string().trim().min(1).max(160),phone:z.string().trim().max(50).optional(),
  source:z.enum(["website","referral","event","partner","other"]),stageId:z.string().uuid(),status:z.enum(["open","won","lost"]).optional(),ownerMembershipId:z.string().uuid().optional(),visibility:z.enum(["workspace","teams"]),teamIds:z.array(z.string().uuid()).max(50),note:z.string().trim().max(4000).optional(),
});
