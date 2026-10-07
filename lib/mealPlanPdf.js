function toPdfText(value) {
    return String(value ?? "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x20-\x7e]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export async function createMealPlanPdf(plan) {
    if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) {
        throw new Error("There is no meal plan to download.");
    }

    const jsPdfModule = await import("jspdf");
    const jsPDF = jsPdfModule.jsPDF || jsPdfModule.default?.jsPDF || jsPdfModule.default?.default || jsPdfModule.default;
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;
    let cursorY = margin;

    const addText = (value, { size = 10, bold = false, indent = 0, gap = 2 } = {}) => {
        const text = toPdfText(value);
        if (!text) return;

        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);
        const lines = pdf.splitTextToSize(text, contentWidth - indent);
        const lineHeight = Math.max(size * 0.45, 4);
        for (const line of lines) {
            if (cursorY + lineHeight > pageHeight - margin) {
                pdf.addPage();
                cursorY = margin;
            }
            pdf.text(line, margin + indent, cursorY);
            cursorY += lineHeight;
        }
        cursorY += gap;
    };

    addText("SmartMeal Planner - 7-Day Meal Plan", { size: 19, bold: true, gap: 3 });
    const generatedDate = new Date(plan.generatedAt || Date.now());
    addText(`Generated ${Number.isNaN(generatedDate.getTime()) ? new Date().toLocaleDateString() : generatedDate.toLocaleDateString()} | Currency: ${toPdfText(plan.currency || "USD")}`, { size: 9, gap: 6 });

    for (const day of plan.days) {
        const meals = Array.isArray(day.meals) ? day.meals : [];
        const dailyTotals = meals.reduce((total, meal) => ({
            calories: total.calories + (Number(meal.calories) || 0),
            protein: total.protein + (Number(meal.protein) || 0),
            fiber: total.fiber + (Number(meal.fiber) || 0),
            cost: total.cost + (Number(meal.estimatedCost) || 0),
        }), { calories: 0, protein: 0, fiber: 0, cost: 0 });

        addText(day.day || "Day", { size: 15, bold: true, gap: 1 });
        addText(`Daily total: ${Math.round(dailyTotals.calories)} kcal | ${Math.round(dailyTotals.protein)}g protein | ${Math.round(dailyTotals.fiber)}g fiber | Estimated cost: ${toPdfText(plan.currency || "USD")} ${dailyTotals.cost.toFixed(2)}`, { size: 9, gap: 3 });

        for (const meal of meals) {
            addText(`${meal.type || "Meal"}: ${meal.name || "Untitled meal"}`, { size: 12, bold: true, indent: 2, gap: 1 });
            addText(meal.description, { indent: 2, gap: 1 });
            addText(`Nutrition: ${Math.round(Number(meal.calories) || 0)} kcal | ${Math.round(Number(meal.protein) || 0)}g protein | ${Math.round(Number(meal.carbs) || 0)}g carbs | ${Math.round(Number(meal.fat) || 0)}g fat | ${Math.round(Number(meal.fiber) || 0)}g fiber`, { size: 9, indent: 2, gap: 1 });
            addText("Ingredients:", { bold: true, indent: 2, gap: 0 });
            for (const ingredient of meal.ingredients || []) {
                addText(`- ${ingredient.quantity || ""} ${ingredient.name || ""}`, { indent: 5, gap: 0.5 });
            }
            addText("Steps:", { bold: true, indent: 2, gap: 0 });
            for (const [index, step] of (meal.steps || []).entries()) {
                addText(`${index + 1}. ${step}`, { indent: 5, gap: 0.5 });
            }
            if (meal.substitutions?.length) {
                addText(`Swap ideas: ${meal.substitutions.map((swap) => `${swap.avoid} to ${swap.use}`).join("; ")}`, { size: 9, indent: 2, gap: 2 });
            } else {
                cursorY += 2;
            }
        }
        cursorY += 3;
    }

    addText("Shopping List", { size: 15, bold: true, gap: 2 });
    if (plan.groceryList?.length) {
        for (const item of plan.groceryList) {
            addText(`- ${item.name}: ${item.quantity}`, { gap: 1 });
        }
    } else {
        addText("No additional groceries needed.");
    }

    const pageCount = pdf.internal.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
    }

    return pdf.output("arraybuffer");
}

export async function downloadMealPlanPdf(plan, filename = "smartmeal-plan.pdf") {
    const pdfData = await createMealPlanPdf(plan);
    const url = URL.createObjectURL(new Blob([pdfData], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
