import { useEffect, useState } from "react";
import { useForm, useField } from "@shopify/react-form";
import { useLoaderData, useNavigate, useParams, useSubmit } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { getQRCode, validateQRCode } from "../models/QRCode.server";

export async function loader({ request, params }) {
  const { admin } = await authenticate.admin(request);

  if (params.id === "new") {
    return {
      destination: "product",
      title: "",
    };
  }

  return await getQRCode(Number(params.id), admin.graphql);
}

export async function action({ request, params }) {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  /** @type {any} */
  const data = {
    ...Object.fromEntries(await request.formData()),
    shop,
  };

  if (data.action === "delete") {
    await db.qRCode.delete({ where: { id: Number(params.id) } });
    return { deletedId: params.id };
  }

  const errors = validateQRCode(data);

  if (errors) {
    return { errors };
  }

  const qrCode =
    params.id === "new"
      ? await db.qRCode.create({ data })
      : await db.qRCode.update({ where: { id: Number(params.id) }, data });

  return { qrCode };
}

export default function QRCodeForm() {
  const loaderData = useLoaderData();
  const qrCode = loaderData.qrCode || loaderData;
  const submit = useSubmit();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const params = useParams();

  const isNew = params.id === "new";

  const {
    fields: {
      title,
      productId,
      productVariantId,
      productHandle,
      destination,
    },
    submitErrors,
    makeClean,
  } = useForm({
    fields: {
      title: useField({
        value: qrCode.title || "",
        validates: [
          (value) => {
            if (!value) {
              return "Title is required";
            }
          },
        ],
      }),
      productId: useField({
        value: qrCode.productId || "",
        validates: [
          (value) => {
            if (!value) {
              return "Product is required";
            }
          },
        ],
      }),
      productVariantId: useField(qrCode.productVariantId || ""),
      productHandle: useField(qrCode.productHandle || ""),
      destination: useField(
        qrCode.destination ? qrCode.destination : "product"
      ),
    },
    onSubmit: async (form) => {
      const data = {
        title: form.title,
        productId: form.productId,
        productVariantId: form.productVariantId,
        productHandle: form.productHandle,
        destination: form.destination,
      };

      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        formData.append(key, value);
      });

      submit(formData, { method: "post" });

      return { status: "success" };
    },
  });

  const [selectedProduct, setSelectedProduct] = useState(
    qrCode.productId
      ? {
          title: qrCode.productTitle,
          images: qrCode.productImage ? [{ originalSrc: qrCode.productImage }] : [],
          handle: qrCode.productHandle,
        }
      : null
  );

  useEffect(() => {
    if (qrCode.id) {
      makeClean();
    }
  }, [qrCode.id, makeClean]);

  useEffect(() => {
    if (loaderData?.deletedId) {
      shopify.toast.show("QR code deleted");
      navigate("/app");
    }
    if (loaderData?.qrCode) {
      shopify.toast.show("QR code saved");
      makeClean();
      if (isNew) {
        navigate(`/app/qrcodes/${loaderData.qrCode.id}`);
      }
    }
  }, [loaderData, navigate, isNew, makeClean, shopify]);

  const handleProductChange = async () => {
    const products = await shopify.resourcePicker({
      type: "product",
      action: "select",
      filter: {
        variants: true,
      },
    });

    if (products) {
      const { images, id, variants, title, handle } = products[0];

      productId.onChange(id);
      productVariantId.onChange(variants[0].id);
      productHandle.onChange(handle);
      setSelectedProduct({
        title: title,
        images: images,
        handle: handle,
      });
    }
  };

  const isDeleting = loaderData?.deletedId === params.id;
  const errorBanner =
    submitErrors.length > 0 ? (
      <s-banner title="There were errors with your submission" tone="critical">
        <ul>
          {submitErrors.map((error, index) => {
            return <li key={`${error}${index}`}>{error}</li>;
          })}
        </ul>
      </s-banner>
    ) : null;

  return (
    <s-page
      heading={isNew ? "Create QR code" : "Edit QR code"}
      backAction="/app"
    >
      <s-stack slot="primary-action" gap="small-200" direction="inline">
        <s-button loading={isDeleting} onClick={() => {}}>
          {isNew ? "Save" : "Save"}
        </s-button>
        {!isNew && (
          <s-button
            onClick={() => {
              const formData = new FormData();
              formData.append("action", "delete");
              submit(formData, { method: "post" });
            }}
            loading={isDeleting}
            variant="tertiary"
            tone="critical"
          >
            Delete QR code
          </s-button>
        )}
      </s-stack>

      <s-grid columns="3fr 1fr" gap="base" areas='["main aside"]'>
        <s-stack gap="base" areas="main">
          {errorBanner}
          <s-section>
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Title"
                name="title"
                value={title.value}
                error={title.error}
                onChange={title.onChange}
                autoComplete="off"
              />

              <s-stack direction="block" gap="base">
                <s-text>Product</s-text>
                {selectedProduct ? (
                  <s-stack direction="inline" gap="base" alignItems="center">
                    {selectedProduct.images?.[0] && (
                      <s-image
                        src={selectedProduct.images[0].originalSrc}
                        alt={selectedProduct.images[0].altText || ""}
                        width="50px"
                        height="50px"
                      />
                    )}
                    <s-text>{selectedProduct.title}</s-text>
                    <s-button onClick={handleProductChange}>
                      Change product
                    </s-button>
                  </s-stack>
                ) : (
                  <s-stack direction="block" gap="base">
                    <s-button onClick={handleProductChange}>
                      Select product
                    </s-button>
                    {productId.error && (
                      <s-banner tone="critical">
                        <s-paragraph>{productId.error}</s-paragraph>
                      </s-banner>
                    )}
                  </s-stack>
                )}
              </s-stack>

              <s-stack direction="block" gap="base">
                <s-text weight="semibold">Scan destination</s-text>
                <s-stack direction="block" gap="small-200">
                  <s-radio
                    name="destination"
                    value="product"
                    checked={destination.value === "product"}
                    onChange={destination.onChange}
                  >
                    Product page
                  </s-radio>
                  <s-radio
                    name="destination"
                    value="cart"
                    checked={destination.value === "cart"}
                    onChange={destination.onChange}
                  >
                    Checkout page with product in the cart
                  </s-radio>
                </s-stack>
              </s-stack>
            </s-stack>
          </s-section>
        </s-stack>

        {qrCode.image && (
          <s-section areas="aside">
            <s-stack direction="block" gap="base">
              <s-text weight="semibold">QR code</s-text>
              <s-image src={qrCode.image} alt="QR Code" />
              {qrCode.destinationUrl && (
                <s-stack direction="block" gap="base">
                  <s-button href={qrCode.destinationUrl} target="_blank">
                    Go to destination
                  </s-button>
                </s-stack>
              )}
            </s-stack>
          </s-section>
        )}
      </s-grid>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
