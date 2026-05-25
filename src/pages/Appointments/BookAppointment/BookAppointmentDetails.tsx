import { useMutation } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { navigate } from "raviger";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { scheduleServiceTypeAtom } from "@/atoms/scheduleServiceTypeAtom";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";

import mutate from "@/Utils/request/mutate";
import { AppointmentSlotPicker } from "@/pages/Appointments/BookAppointment/AppointmentSlotPicker";
import useCurrentFacility from "@/pages/Facility/utils/useCurrentFacility";
import { TagConfig } from "@/types/emr/tagConfig/tagConfig";
import scheduleApi from "@/types/scheduling/scheduleApi";

import { ScheduleResourceFormState } from "@/components/Schedule/ResourceSelector";
import { Appointment } from "@/types/scheduling/schedule";
import { AppointmentDateSelection } from "./AppointmentDateSelection";
import { AppointmentFormSection } from "./AppointmentFormSection";

interface RazorpayBookingData extends Appointment {
  payment_required?: boolean;
  razorpay_order_id?: string;
  razorpay_key?: string;
  payment_amount?: number;
  currency?: string;
  appointment_medium?: string;
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_signature: string;
  razorpay_order_id?: string;
}

interface RazorpayInstance {
  open: () => void;
}

type RazorpayConstructor = new (options: unknown) => RazorpayInstance;

export const BookAppointmentDetails = ({
  patientId,
  onSuccess,
}: {
  patientId: string;
  onSuccess?: () => void;
}) => {
  const { t } = useTranslation();

  const { facilityId } = useCurrentFacility();
  const [cachedServiceType, setCachedServiceType] = useAtom(
    scheduleServiceTypeAtom,
  );

  const [selectedSlotId, setSelectedSlotId] = useState<string>();
  const [selectedTags, setSelectedTags] = useState<TagConfig[]>([]);
  const [reason, setReason] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [appointmentMedium, setAppointmentMedium] =
    useState<string>("in_person");

  const [selectedResource, setSelectedResource] =
    useState<ScheduleResourceFormState>({
      resource: null,
      resource_type: cachedServiceType,
    });

  useEffect(() => {
    if (
      selectedResource.resource === null &&
      selectedResource.resource_type !== cachedServiceType
    ) {
      setSelectedResource({
        resource: null,
        resource_type: cachedServiceType,
      });
    }
  }, [
    cachedServiceType,
    selectedResource.resource,
    selectedResource.resource_type,
  ]);

  const handleResourceChange = (resource: ScheduleResourceFormState) => {
    setSelectedResource(resource);
    if (resource.resource_type !== cachedServiceType) {
      setCachedServiceType(resource.resource_type);
    }
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleRazorpayPayment = async (bookingData: RazorpayBookingData) => {
    const res = await loadRazorpayScript();
    if (!res) {
      toast.error(
        t(
          "razorpay_load_failed",
          "Failed to load Razorpay SDK. Please check your connection.",
        ),
      );
      return;
    }

    const options = {
      key: bookingData.razorpay_key || "rzp_test_placeholder",
      amount: bookingData.payment_amount,
      currency: bookingData.currency || "INR",
      name: "Care EMR",
      description: `Appointment Pre-Payment (${bookingData.appointment_medium})`,
      order_id: bookingData.razorpay_order_id,
      handler: async function (response: RazorpayResponse) {
        try {
          const verificationResponse = await mutate(
            scheduleApi.appointments.confirmPayment,
            {
              pathParams: {
                facilityId: facilityId ?? "",
                bookingId: bookingData.id,
              },
            },
          )({
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });

          toast.success(
            t(
              "payment_verified_and_appointment_confirmed",
              "Payment verified and appointment confirmed!",
            ),
          );
          onSuccess?.();
          navigate(
            `/facility/${facilityId}/patient/${patientId}/appointments/${verificationResponse.id}?showSuccess=true`,
          );
        } catch (_error: unknown) {
          toast.error(
            t(
              "payment_verification_failed",
              "Payment verification failed. Please contact support.",
            ),
          );
        }
      },
      prefill: {
        name: "",
        email: "",
        contact: "",
      },
      theme: {
        color: "#0f766e",
      },
      modal: {
        ondismiss: function () {
          toast.warning(
            t(
              "payment_cancelled",
              "Payment cancelled. Complete payment within 10 minutes to hold slot.",
            ),
          );
        },
      },
    };

    const Razorpay = (window as unknown as { Razorpay: RazorpayConstructor })
      .Razorpay;
    const paymentObject = new Razorpay(options);
    paymentObject.open();
  };

  const { mutateAsync: createAppointment, isPending: isCreating } = useMutation(
    {
      mutationFn: mutate(scheduleApi.slots.createAppointment, {
        pathParams: { facilityId, slotId: selectedSlotId ?? "" },
      }),
      onSuccess: (data: RazorpayBookingData) => {
        if (data.status === "payment_pending" || data.payment_required) {
          handleRazorpayPayment(data);
        } else {
          toast.success(t("appointment_created_successfully"));
          onSuccess?.();
          navigate(
            `/facility/${facilityId}/patient/${patientId}/appointments/${data.id}?showSuccess=true`,
          );
        }
      },
    },
  );

  const handleSubmit = async () => {
    if (!selectedResource || !selectedSlotId) {
      return;
    }

    await createAppointment({
      patient: patientId,
      note: reason,
      tags: selectedTags.map((tag) => tag.id),
      appointment_medium: appointmentMedium,
    });
  };

  const handleIsOpen = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setCurrentStep(1);
      setSelectedSlotId(undefined);
    }
  };

  return (
    <div className="w-full">
      <div className="flex flex-row gap-4 justify-center">
        <div className="flex flex-col gap-8 p-4 w-114 bg-white shadow rounded-lg">
          <AppointmentFormSection
            facilityId={facilityId}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            reason={reason}
            setReason={setReason}
            selectedResource={selectedResource}
            setSelectedResource={handleResourceChange}
            appointmentMedium={appointmentMedium}
            setAppointmentMedium={setAppointmentMedium}
          />
        </div>
        <div className="hidden sm:flex sm:flex-col lg:flex-row gap-6 bg-white shadow rounded-lg p-4 w-full sm:max-h-full">
          <AppointmentDateSelection
            facilityId={facilityId}
            resourceId={selectedResource.resource?.id}
            resourceType={selectedResource.resource_type}
            setSelectedDate={setSelectedDate}
            selectedDate={selectedDate}
          />
          <div className="w-full overflow-y-auto max-h-[calc(100vh-17rem)]">
            <AppointmentSlotPicker
              facilityId={facilityId}
              resourceId={selectedResource.resource?.id}
              resourceType={selectedResource.resource_type}
              selectedSlotId={selectedSlotId}
              onSlotSelect={setSelectedSlotId}
              selectedDate={selectedDate}
            />
          </div>
        </div>
      </div>
      {selectedSlotId && (
        <div className="hidden sm:flex p-4 shadow mt-2">
          <div className="flex gap-4 ml-auto">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                setSelectedSlotId("");
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              type="submit"
              disabled={isCreating}
            >
              {t("confirm_appointment")}
            </Button>
          </div>
        </div>
      )}
      <Drawer open={isOpen} onOpenChange={handleIsOpen}>
        <DrawerTrigger asChild>
          <Button
            className="sm:hidden w-full mt-3"
            disabled={!selectedResource.resource?.id}
            onClick={() => {
              setIsOpen(true);
              setCurrentStep(1);
            }}
          >
            {t("select_date")}
            <ArrowRight size={16} />
          </Button>
        </DrawerTrigger>
        <DrawerContent className="w-full p-4 space-y-4">
          <div className="flex flex-col gap-3 overflow-y-auto -mx-2">
            {currentStep === 1 && (
              <>
                <AppointmentDateSelection
                  facilityId={facilityId}
                  resourceId={selectedResource.resource?.id}
                  resourceType={selectedResource.resource_type}
                  setSelectedDate={setSelectedDate}
                  selectedDate={selectedDate}
                />
                <Button
                  className="w-full"
                  disabled={!selectedDate}
                  onClick={() => setCurrentStep(2)}
                >
                  {t("select_slot")}
                  <ArrowRight size={16} />
                </Button>
              </>
            )}
          </div>

          {currentStep === 2 && (
            <>
              <AppointmentSlotPicker
                facilityId={facilityId}
                resourceId={selectedResource.resource?.id}
                resourceType={selectedResource.resource_type}
                selectedSlotId={selectedSlotId}
                onSlotSelect={setSelectedSlotId}
                selectedDate={selectedDate}
              />
              <div className="sm:hidden flex flex-row gap-2 items-center justify-around">
                <Button
                  variant="outline"
                  className="w-fit"
                  onClick={() => {
                    setCurrentStep(1);
                    setSelectedSlotId(undefined);
                  }}
                >
                  <ArrowLeft />
                  {t("back")}
                </Button>
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={!selectedSlotId || isCreating}
                >
                  {t("confirm_appointment")}
                </Button>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
};
