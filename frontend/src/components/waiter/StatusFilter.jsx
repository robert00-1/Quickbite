function StatusFilter({ statuses, counts, selectedStatus, onStatusChange}){
    const tabs = ["Active", ...statuses];

    return (
        <div className="flex flex-wrap gap-3" role="tablist">
            {tabs.map((status) =>{
                const isSelected = selectedStatus === status;

                return(
                    <button
                    className={`rounded-lg border-3 px-3 font-semibold transition ${
                        isSelected
                            ? "border-red-450 bg-red-50 text-red-600"
                :           "border-gray-200 bg-white text-gray-650 hover:border-red-300"
                        }`}
                    key = {status}
                    type="button"
                    role="tab" 
                    aria-selected={isSelected} 
                    onClick={() => onStatusChange(status)}
                    >
                        {status} ({counts[status] || 0})
                    </button>
                );

            }
            )}
        </div>
    );
}

export default StatusFilter;